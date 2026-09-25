#!/usr/bin/env python3
"""PostToolUse (Edit|Write) — fast, warn-only convention checks.

Re-reads the just-edited file from disk and greps for a handful of patterns
this repo's conventions flag. Never blocks — the edit already happened — this
just relays a reminder into the transcript so Claude can self-correct in a
follow-up edit if the flag is a real hit (some are heuristic and may be
false positives; ESLint/tsc remain the authoritative gate at commit time).
Sources: .claude/rules/{react,design,web}.md
"""
import json
import re
import sys

CLIENT_STYLE_RE = re.compile(r"/apps/client/src/.*\.(tsx|css)$")
CLIENT_EXCLUDE = ("/lib/tokens.ts", "/index.css", "/components/ui/")
SERVER_TS_RE = re.compile(r"/apps/server/src/.*\.ts$")

HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
CONSOLE_RE = re.compile(r"\bconsole\.\w+\(")
ANY_RE = re.compile(r":\s*any\b|as\s+any\b")
BARE_USE_STORE_RE = re.compile(r"useStore\(\s*\)")
FETCH_RE = re.compile(r"\bfetch\(")
ABORT_RE = re.compile(r"AbortSignal\.timeout")


def read_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def main():
    data = json.load(sys.stdin)
    file_path = data.get("tool_input", {}).get("file_path", "") or ""
    if not file_path:
        return 0

    content = read_file(file_path)
    if content is None:
        return 0

    normalized = file_path.replace("\\", "/")
    warnings = []

    if CLIENT_STYLE_RE.search(normalized) and not any(x in normalized for x in CLIENT_EXCLUDE):
        if HEX_RE.search(content):
            warnings.append(
                "hardcoded hex color — colors should come from @/lib/tokens "
                "(.claude/rules/design.md)"
            )
        if BARE_USE_STORE_RE.search(content):
            warnings.append(
                "useStore() called with no selector — subscribe with a fine-grained "
                "selector instead (.claude/rules/react.md § Zustand)"
            )

    if (CLIENT_STYLE_RE.search(normalized) or SERVER_TS_RE.search(normalized)) and ANY_RE.search(content):
        warnings.append(
            "`any` / `as any` found — no-explicit-any is an ESLint error "
            "(.claude/rules/react.md / web.md)"
        )

    if SERVER_TS_RE.search(normalized) and "/config.ts" not in normalized:
        if CONSOLE_RE.search(content):
            warnings.append(
                "console.* found — Pino's `log` is the only logger outside config.ts "
                "(.claude/rules/web.md § Logging discipline)"
            )
        if FETCH_RE.search(content) and not ABORT_RE.search(content):
            warnings.append(
                "fetch(...) found with no AbortSignal.timeout(...) anywhere in the file "
                "(.claude/rules/web.md § Egress)"
            )

    if warnings:
        print(f"post-edit-lint reminder for {file_path}:", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
        return 2  # edit already applied — this just surfaces the note to Claude

    return 0


if __name__ == "__main__":
    sys.exit(main())
