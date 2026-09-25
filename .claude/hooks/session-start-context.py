#!/usr/bin/env python3
"""SessionStart — injects the process non-negotiables + current branch state
as context, so every session starts with them loaded rather than depending
on the model choosing to read AGENTS.md / session-bootstrap on its own.
Source: .claude/skills/session-bootstrap/SKILL.md, .claude/rules/git.md.
"""
import json
import subprocess
import sys


def run(cmd, cwd):
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def main():
    data = json.load(sys.stdin)
    cwd = data.get("cwd") or "."

    branch = run(["git", "branch", "--show-current"], cwd)

    lines = [
        "cryptopapertrade.com session context:",
        "- Non-negotiables (.claude/skills/session-bootstrap): (1) no implementation "
        "without explicit instruction this turn; (2) visual Q&A gate before any UI change.",
        "- Conventions live in .claude/rules/ (react, web, design, security, "
        "testing, git) — read the one matching what you're about to touch.",
    ]
    if branch:
        lines.append(f"- Current branch: {branch}.")
        if branch == "main":
            lines.append(
                "  ⚠️ On `main` directly — per .claude/rules/git.md, "
                "feature/fix work belongs on a feat/... or fix/... branch, cut from "
                "main only once develop is already merged into it."
            )

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
