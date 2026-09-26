#!/usr/bin/env python3
"""PreToolUse + PostToolUse (Bash) — unresolved Claude review comments on a PR.

Enforces .claude/rules/git.md § Review comments: every inline review comment the Claude GitHub
review bot leaves on a PR goes through the `pr-review-comments` skill, meaning it is verified,
fixed or answered, and then approved by the user before the PR merges.

- PreToolUse, `gh pr merge [target]`: blocks (exit 2) while the target PR has unresolved threads
  started by the Claude bot. This is the gate that would have stopped PR #130 from shipping two
  open findings.
- PostToolUse, `gh pr checks|view|create`, `gh run watch|view`: those are the moments a
  session looks at a PR, and the bot posts its comments when its review check finishes. If
  unresolved Claude threads exist, their locations are relayed to Claude (exit 2 feedback; the
  command already ran) with the instruction to run the skill.

Only commands that actually *invoke* `gh` count. The command is split into shell segments and
heredoc bodies are dropped, so a commit message or `--grep` pattern that merely mentions
`gh pr merge` is ignored. The target PR comes from the command's own positional argument (number,
URL or branch; `--head` for `create`; the run's branch for `gh run`), and falls back to the current
branch's PR only when the command names no target.

Fails open. If `gh` is missing, unauthenticated, offline or slow, the event is unknown, or the PR
can't be determined, it exits 0 silently. It is an early catch, not the only line of defence.

Parsing is pure and unit-tested: `python3 .claude/hooks/tests/test_check_claude_review_threads.py`.
"""
import json
import re
import shlex
import subprocess
import sys

BOT_LOGINS = {"claude", "claude[bot]"}
GH_TIMEOUT_S = 10
MAX_THREAD_PAGES = 20  # 20 × 100 threads — far past any real PR, but never an unbounded loop

# Subcommands this hook reacts to, per event.
MERGE = ("pr", "merge")
LOOK = {("pr", "checks"), ("pr", "view"), ("pr", "create"), ("run", "watch"), ("run", "view")}

# Flags that consume the next token, per subcommand (from `gh <cmd> --help`). Boolean flags are
# everything else; `--flag=value` forms never consume the next token.
VALUE_FLAGS = {
    ("pr", "merge"): {"-A", "--author-email", "-b", "--body", "-F", "--body-file",
                      "--match-head-commit", "-t", "--subject", "-R", "--repo"},
    ("pr", "view"): {"--json", "-q", "--jq", "-t", "--template", "-R", "--repo"},
    ("pr", "checks"): {"-i", "--interval", "--json", "-q", "--jq", "-t", "--template",
                       "-R", "--repo"},
    ("pr", "create"): {"-a", "--assignee", "-B", "--base", "-b", "--body", "-F", "--body-file",
                       "-H", "--head", "-l", "--label", "-m", "--milestone", "-p", "--project",
                       "-r", "--reviewer", "-t", "--title", "-T", "--template", "--recover",
                       "-R", "--repo"},
    ("run", "watch"): {"-i", "--interval", "-R", "--repo"},
    ("run", "view"): {"-j", "--job", "--attempt", "--json", "-q", "--jq", "-t", "--template",
                      "-R", "--repo"},
}

HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2\s*(?=\n|$)", re.DOTALL)
SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||[;|\n]|\$\(|`")
ENV_ASSIGN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
PR_URL_RE = re.compile(r"/pull/(\d+)")

QUERY = """
query($o: String!, $n: String!, $p: Int!, $after: String) {
  repository(owner: $o, name: $n) {
    pullRequest(number: $p) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          comments(first: 1) { nodes { author { login } path line originalLine } }
        }
      }
    }
  }
}
"""


# ─── Pure parsing (unit-tested) ─────────────────────────────────────────────────


def gh_invocations(command):
    """Every `gh <group> <sub> ...` actually invoked by a shell command string.

    Returns a list of dicts: {sub: (group, sub), target: str|None, repo: str|None}, where
    `target` is the PR number/URL/branch (or run id for `gh run`) the command names, and `repo`
    is its `-R/--repo` value. Heredoc bodies are dropped and the command is split into shell
    segments first, so text that merely mentions `gh pr merge` never counts.
    """
    stripped = HEREDOC_RE.sub("", command)
    found = []
    for segment in SEGMENT_SPLIT_RE.split(stripped):
        try:
            tokens = shlex.split(segment, comments=True)
        except ValueError:
            tokens = segment.split()
        while tokens and (ENV_ASSIGN_RE.match(tokens[0]) or tokens[0] in ("(", "{", "then", "do", "!")):
            tokens = tokens[1:]
        if len(tokens) < 3 or tokens[0] != "gh":
            continue
        sub = (tokens[1], tokens[2])
        if sub != MERGE and sub not in LOOK:
            continue
        found.append(_parse_args(sub, tokens[3:]))
    return found


def _parse_args(sub, args):
    value_flags = VALUE_FLAGS.get(sub, set())
    target = repo = head = None
    i = 0
    while i < len(args):
        arg = args[i]
        if arg.startswith("-"):
            name, eq, value = arg.partition("=")
            if name in value_flags and not eq:
                value = args[i + 1] if i + 1 < len(args) else None
                i += 1
            if name in ("-R", "--repo"):
                repo = value
            elif name in ("-H", "--head") and sub == ("pr", "create"):
                head = value
        elif target is None:
            target = arg
        i += 1
    if sub == ("pr", "create"):
        target = head  # `gh pr create` takes no positional; the PR is the one for --head
    return {"sub": sub, "target": target, "repo": repo}


def pr_number_from_target(target):
    """A PR number from a numeric or URL target; None for a branch name or no target."""
    if target is None:
        return None
    if target.lstrip("#").isdigit():
        return int(target.lstrip("#"))
    m = PR_URL_RE.search(target)
    return int(m.group(1)) if m else None


# ─── GitHub lookups (fail open) ─────────────────────────────────────────────────


def gh(args, cwd):
    try:
        out = subprocess.run(
            ["gh", *args],
            cwd=cwd or None,
            capture_output=True,
            text=True,
            timeout=GH_TIMEOUT_S,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def resolve_pr(inv, cwd):
    """(repo, number) of the PR an invocation is about, or None when it can't be determined."""
    repo_args = ["-R", inv["repo"]] if inv["repo"] else []
    target = inv["target"]

    if inv["sub"][0] == "run":
        # A run id → that run's branch → its PR. No run id → current branch's PR.
        if target and target.isdigit():
            target = gh(["run", "view", target, "--json", "headBranch", "--jq", ".headBranch", *repo_args], cwd)
            if not target:
                return None
        else:
            target = None

    number = pr_number_from_target(target)
    if number is None:
        # A named branch resolves to its PR. Only a command with no target at all falls back
        # to the current branch, never one whose target just failed to parse.
        view = ["pr", "view", *([target] if target else []), "--json", "number", "--jq", ".number"]
        num = gh([*view, *repo_args], cwd)
        if not num or not num.isdigit():
            return None
        number = int(num)

    repo = inv["repo"] or gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], cwd)
    if not repo or "/" not in repo:
        return None
    return repo, number


def unresolved_claude_threads(repo, pr, cwd):
    owner, name = repo.split("/", 1)
    found = []
    after = None
    for _ in range(MAX_THREAD_PAGES):
        args = ["api", "graphql", "-f", f"query={QUERY}", "-F", f"o={owner}", "-F", f"n={name}",
                "-F", f"p={pr}"]
        if after:
            args += ["-f", f"after={after}"]
        raw = gh(args, cwd)
        if raw is None:
            return None
        try:
            threads = json.loads(raw)["data"]["repository"]["pullRequest"]["reviewThreads"]
            nodes, page = threads["nodes"], threads["pageInfo"]
        except (ValueError, KeyError, TypeError):
            return None

        for node in nodes:
            if node.get("isResolved"):
                continue
            first = (node.get("comments") or {}).get("nodes") or []
            if not first:
                continue
            c = first[0]
            if ((c.get("author") or {}).get("login") or "") in BOT_LOGINS:
                found.append(f"{c.get('path')}:{c.get('line') or c.get('originalLine') or '?'}")

        if not page.get("hasNextPage"):
            break
        after = page.get("endCursor")
    return found


# ─── Hook entry point ───────────────────────────────────────────────────────────


def main():
    data = json.load(sys.stdin)
    event = data.get("hook_event_name", "")
    if event not in ("PreToolUse", "PostToolUse"):
        return 0  # unknown/missing event (e.g. a hand-run test) — fail open
    command = data.get("tool_input", {}).get("command", "") or ""
    cwd = data.get("cwd", "")

    wanted = {MERGE} if event == "PreToolUse" else LOOK
    invocations = [inv for inv in gh_invocations(command) if inv["sub"] in wanted]

    reports = []
    seen = set()
    for inv in invocations:
        resolved = resolve_pr(inv, cwd)
        # One report per PR, however many gh calls in the command point at it
        if resolved is None or resolved in seen:
            continue
        seen.add(resolved)
        repo, pr = resolved
        threads = unresolved_claude_threads(repo, pr, cwd)
        if threads:
            reports.append((pr, threads))
    if not reports:
        return 0

    for pr, threads in reports:
        where = ", ".join(threads)
        if event == "PreToolUse":
            print(
                f"Blocked: PR #{pr} has {len(threads)} unresolved Claude review comment(s) ({where}). "
                "Run the `pr-review-comments` skill: verify each one, draft the fix or a reply, and "
                "get the user's approval. The thread is resolved only after that. Then merge. "
                "See .claude/rules/git.md § Review comments.",
                file=sys.stderr,
            )
        else:
            print(
                f"PR #{pr} has {len(threads)} unresolved Claude review comment(s) ({where}). "
                "Run the `pr-review-comments` skill now: verify each, draft fixes, and wait for the "
                "user's approval before committing, replying or resolving.",
                file=sys.stderr,
            )
    return 2


if __name__ == "__main__":
    sys.exit(main())
