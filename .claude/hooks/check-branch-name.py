#!/usr/bin/env python3
"""PreToolUse (Bash) — enforces .claude/conventions/git.md § Branching & PR flow.

Blocks creating a new branch whose name doesn't follow the
`<feat|fix>/kebab-description` convention.
"""
import json
import re
import sys

NAME_RE = re.compile(r"^(feat|fix)/[a-z0-9]+(-[a-z0-9]+)*$")
ALLOWED_EXACT = {"main", "develop"}


def find_new_branch_name(command):
    for pattern in (
        r"git\s+checkout\s+-b\s+([^\s;&|]+)",
        r"git\s+switch\s+-c\s+([^\s;&|]+)",
        r"git\s+branch\s+([^\s;&|-][^\s;&|]*)",  # `git branch <name>`, not a flag like -a/-d
    ):
        m = re.search(pattern, command)
        if m:
            return m.group(1)
    return None


def main():
    data = json.load(sys.stdin)
    command = data.get("tool_input", {}).get("command", "") or ""

    name = find_new_branch_name(command)
    if not name:
        return 0

    if name in ALLOWED_EXACT or NAME_RE.match(name):
        return 0

    print(
        f'Blocked: branch name "{name}" doesn\'t follow the "<feat|fix>/kebab-description" '
        "convention (see .claude/conventions/git.md § Branching & PR flow).",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
