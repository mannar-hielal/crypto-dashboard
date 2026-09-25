#!/usr/bin/env python3
"""PreToolUse (Bash) — enforces .claude/rules/security.md § Secrets management.

Before a `git commit` runs, scans the staged diff for common secret shapes
and blocks the commit if one is found. `.env.example` is exempt since it's
meant to hold documented placeholder values only.
"""
import json
import re
import subprocess
import sys

PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),  # AWS access key id shape
    re.compile(r"(?i)\b(secret|token|password|api[_-]?key)\s*[:=]\s*['\"][^'\"\s]{8,}['\"]"),
]


def main():
    data = json.load(sys.stdin)
    command = data.get("tool_input", {}).get("command", "") or ""
    cwd = data.get("cwd") or "."

    if not re.search(r"git\s+commit\b", command):
        return 0

    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--", ".", ":(exclude).env.example"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception as exc:  # defensive — never let the hook itself crash the commit
        print(f"scan-staged-secrets: could not read staged diff ({exc}) — skipping.", file=sys.stderr)
        return 0

    diff = result.stdout or ""
    hits = []
    for line in diff.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for pattern in PATTERNS:
            if pattern.search(line):
                hits.append(line.strip()[:120])
                break

    if hits:
        print(
            "Blocked: staged diff looks like it contains a secret/credential "
            "(see .claude/rules/security.md § Secrets management):",
            file=sys.stderr,
        )
        for h in hits[:5]:
            print(f"  {h}", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
