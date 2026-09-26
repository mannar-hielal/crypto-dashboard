#!/usr/bin/env python3
"""PreToolUse + PostToolUse (Bash) — unresolved Claude review comments on a PR.

Enforces .claude/rules/git.md § Review comments: every inline review comment the Claude GitHub
review bot leaves on a PR goes through the `pr-review-comments` skill, meaning it is verified,
fixed or answered, and then approved by the user before the PR merges.

- PreToolUse, `gh pr merge [N]`: blocks (exit 2) while PR N has unresolved threads started by
  the Claude bot. This is the gate that would have stopped PR #130 from shipping two open
  findings.
- PostToolUse, `gh pr checks|view|create`, `gh run watch|view`: those are the moments a
  session looks at a PR, and the bot posts its comments when its review check finishes. If
  unresolved Claude threads exist, their locations are relayed to Claude (exit 2 feedback; the
  command already ran) with the instruction to run the skill.

Fails open. If `gh` is missing, unauthenticated, offline or slow, or the PR can't be
determined, it exits 0 silently. It is an early catch, not the only line of defence.
"""
import json
import re
import subprocess
import sys

BOT_LOGINS = {"claude", "claude[bot]"}
GH_TIMEOUT_S = 10

MERGE_RE = re.compile(r"\bgh\s+pr\s+merge\b(?:\s+(\d+))?")
LOOK_RE = re.compile(r"\bgh\s+(?:pr\s+(?:checks|view|create)|run\s+(?:watch|view))\b")
PR_NUM_RE = re.compile(r"\bgh\s+pr\s+(?:checks|view|merge)\s+(\d+)\b")

QUERY = """
query($o: String!, $n: String!, $p: Int!) {
  repository(owner: $o, name: $n) {
    pullRequest(number: $p) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 1) { nodes { author { login } path line originalLine } }
        }
      }
    }
  }
}
"""


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


def resolve_pr_number(command, cwd):
    m = PR_NUM_RE.search(command)
    if m:
        return int(m.group(1))
    # No explicit number: the PR for the current branch, if there is one.
    num = gh(["pr", "view", "--json", "number", "--jq", ".number"], cwd)
    return int(num) if num and num.isdigit() else None


def unresolved_claude_threads(pr, cwd):
    repo = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], cwd)
    if not repo or "/" not in repo:
        return None
    owner, name = repo.split("/", 1)
    raw = gh(
        ["api", "graphql", "-f", f"query={QUERY}", "-F", f"o={owner}", "-F", f"n={name}", "-F", f"p={pr}"],
        cwd,
    )
    if raw is None:
        return None
    try:
        nodes = json.loads(raw)["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    except (ValueError, KeyError, TypeError):
        return None

    found = []
    for node in nodes:
        if node.get("isResolved"):
            continue
        first = (node.get("comments") or {}).get("nodes") or []
        if not first:
            continue
        c = first[0]
        if ((c.get("author") or {}).get("login") or "") in BOT_LOGINS:
            found.append(f"{c.get('path')}:{c.get('line') or c.get('originalLine') or '?'}")
    return found


def main():
    data = json.load(sys.stdin)
    command = data.get("tool_input", {}).get("command", "") or ""
    cwd = data.get("cwd", "")
    event = data.get("hook_event_name", "")

    is_merge = bool(MERGE_RE.search(command))
    if event == "PreToolUse" and not is_merge:
        return 0
    if event == "PostToolUse" and (is_merge or not LOOK_RE.search(command)):
        return 0

    pr = resolve_pr_number(command, cwd)
    if pr is None:
        return 0
    threads = unresolved_claude_threads(pr, cwd)
    if not threads:
        return 0

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
