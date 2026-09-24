#!/usr/bin/env python3
"""PreToolUse (Edit|Write) — blocks hand-edits to the auto-generated Prisma
client (apps/server/generated/**). Regenerate via `pnpm prisma generate`
instead of editing it directly — the changes are silently lost on the next
generate. See .claude/conventions/web.md § Architecture boundaries.
"""
import json
import sys

BLOCKED_MARKER = "apps/server/generated/"


def main():
    data = json.load(sys.stdin)
    file_path = (data.get("tool_input", {}).get("file_path") or "").replace("\\", "/")

    if BLOCKED_MARKER in file_path:
        print(
            f"Blocked: {file_path} is auto-generated (Prisma client) — hand edits are "
            "silently lost on the next `pnpm prisma generate`. Change the Prisma schema "
            "or config instead (see .claude/conventions/web.md § Architecture boundaries).",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
