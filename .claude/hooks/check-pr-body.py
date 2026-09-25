#!/usr/bin/env python3
"""PreToolUse (Bash) — enforces .claude/rules/git.md § Pull requests.

Blocks `gh pr create` unless the body contains all 6 required template
sections — applies equally to a feature/fix -> develop PR and a
develop -> main release PR (git.md is explicit that both use the same body).
"""
import json
import os
import re
import sys

REQUIRED_HEADERS = [
    "## \U0001F4CB",  # 📋 What does this PR do?
    "## \U0001F517",  # 🔗 Related issue / ticket
    "## ✅ Type of change",  # ✅
    "## \U0001F9EA How to test",  # 🧪
    "## \U0001F4F8 Screenshots",  # 📸
    "## \U0001F512 Security / DevOps checklist",  # 🔒
]


def extract_body(command, cwd):
    m = re.search(r"--body-file\s+(['\"]?)([^\s'\"]+)\1", command)
    if m:
        path = m.group(2)
        if not os.path.isabs(path):
            path = os.path.join(cwd or ".", path)
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except OSError:
            return None

    # Heredoc form: --body "$(cat <<'EOF' ... EOF)"
    m = re.search(r"<<-?['\"]?EOF['\"]?\s*\n(.*?)\nEOF", command, re.DOTALL)
    if m:
        return m.group(1)

    # Simple inline form: --body "..."
    m = re.search(r"""--body\s+(['"])(.*?)\1""", command, re.DOTALL)
    if m:
        return m.group(2)

    return None


def main():
    data = json.load(sys.stdin)
    command = data.get("tool_input", {}).get("command", "") or ""
    cwd = data.get("cwd", "")

    if not re.search(r"gh\s+pr\s+create\b", command):
        return 0

    body = extract_body(command, cwd)
    if body is None:
        print(
            "check-pr-body: could not locate the PR body (no --body/--body-file found) "
            "— skipping the template check. Make sure it follows "
            ".claude/rules/git.md § Pull requests.",
            file=sys.stderr,
        )
        return 0

    missing = [h for h in REQUIRED_HEADERS if h not in body]
    if missing:
        print(
            "Blocked: PR body is missing required section(s): "
            + ", ".join(missing)
            + ". See .claude/rules/git.md § Pull requests for the full template.",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
