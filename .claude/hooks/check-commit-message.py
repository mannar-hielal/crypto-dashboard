#!/usr/bin/env python3
"""PreToolUse (Bash) — enforces .claude/rules/git.md § Commit messages.

Blocks a `git commit` invocation unless the subject line starts with one of
the canonical prefixes. Fails OPEN (allows the command) when the message
can't be confidently parsed out of the shell string, rather than blocking a
legitimate commit over a parsing gap — this is a convenience net, not the
only line of defense (husky's pre-commit hook still runs regardless).
"""
import json
import re
import sys

ALLOWED = ("feat", "fix", "security", "chore", "setup", "docs", "refactor", "test")


def extract_subject(command):
    # Heredoc form this project's own commits use — must be checked BEFORE the
    # simple form below, since `-m "$(cat <<'EOF' ... )"` would otherwise also
    # match the simple quoted-string pattern and capture the wrong line:
    #   git commit -m "$(cat <<'EOF'
    #   type: subject
    #   ...
    #   EOF
    #   )"
    m = re.search(r"<<-?['\"]?EOF['\"]?\s*\n(.*?)\nEOF", command, re.DOTALL)
    if m and m.group(1).strip():
        return m.group(1).strip().splitlines()[0]

    # Simple form: -m "message" / -m 'message'
    m = re.search(r"""-m\s+(['"])(.*?)\1""", command, re.DOTALL)
    if m and m.group(2).strip():
        return m.group(2).strip().splitlines()[0]

    return None


def main():
    data = json.load(sys.stdin)
    command = data.get("tool_input", {}).get("command", "") or ""

    if not re.search(r"(^|[;&|]\s*)git\s+commit\b", command):
        return 0
    if re.search(r"--amend\b|--fixup\b|--squash\b", command):
        return 0  # no new subject line to validate, or reusing an already-validated one

    subject = extract_subject(command)
    if not subject:
        print(
            "check-commit-message: could not parse the commit subject from this "
            "command — skipping the prefix check (see .claude/rules/git.md "
            "§ Commit messages). Double-check it manually.",
            file=sys.stderr,
        )
        return 0

    if not re.match(rf"^({'|'.join(ALLOWED)}): .+", subject):
        allowed_list = ", ".join(f"{p}:" for p in ALLOWED)
        print(
            f'Blocked: commit subject "{subject}" doesn\'t start with an allowed '
            f"prefix ({allowed_list}). See .claude/rules/git.md § Commit messages.",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
