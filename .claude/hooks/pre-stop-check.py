#!/usr/bin/env python3
"""Stop — final checks before Claude ends its turn.

1. HARD GATE (re-checked even on a forced continuation): if package.json or
   pnpm-lock.yaml changed, re-run `pnpm audit --audit-level=high` and block
   stopping on failure — catches a CVE regression before the human even asks
   to commit. Source: .claude/rules/security.md § Supply-chain security.
2. SOFT NUDGES (checked once per turn only, via stop_hook_active, so this
   never loops): warn if server routes/plugins changed with no matching test
   change (refactor-safety reminder), or if client component/style files
   changed with no mention of "screenshot" anywhere in the transcript yet.
   Sources: security.md § Verify a refactor is safe, design.md, git.md § PRs.
"""
import json
import subprocess
import sys


def run(cmd, cwd, timeout=60):
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except Exception:
        return None


def changed_files(cwd):
    names = set()
    proc = run(["git", "diff", "--name-only", "HEAD"], cwd)
    if proc and proc.returncode == 0:
        names.update(proc.stdout.splitlines())
    proc2 = run(["git", "status", "--porcelain"], cwd)
    if proc2 and proc2.returncode == 0:
        for line in proc2.stdout.splitlines():
            parts = line.strip().split(maxsplit=1)
            if len(parts) == 2:
                names.add(parts[1])
    return names


def main():
    data = json.load(sys.stdin)
    stop_hook_active = bool(data.get("stop_hook_active"))
    cwd = data.get("cwd") or "."

    files = changed_files(cwd)
    if not files:
        return 0

    # 1. Hard gate — always re-checked, even during a forced continuation,
    # since it can only clear once the CVE is actually fixed.
    if any(f in ("package.json", "pnpm-lock.yaml") for f in files):
        proc = run(["pnpm", "audit", "--audit-level=high"], cwd, timeout=120)
        if proc is not None and proc.returncode != 0:
            print(
                "Blocked: package.json/pnpm-lock.yaml changed and "
                "`pnpm audit --audit-level=high` is failing. Fix it or add/adjust a "
                "pnpm.overrides entry before finishing "
                "(.claude/rules/security.md § Supply-chain security):",
                file=sys.stderr,
            )
            print((proc.stdout or "")[-2000:], file=sys.stderr)
            return 2

    if stop_hook_active:
        return 0  # already nudged once this turn — don't loop on soft reminders

    warnings = []

    server_touched = sorted(
        f for f in files
        if f.startswith("apps/server/src/routes/") or f.startswith("apps/server/src/plugins/")
    )
    tests_touched = any("__tests__" in f for f in files)
    if server_touched and not tests_touched:
        warnings.append(
            "Server route/plugin file(s) changed with no test file change: "
            + ", ".join(server_touched[:5])
            + ". If this was a refactor, confirm the checklist in "
            "security.md#verify-a-refactor-is-safe was applied."
        )

    client_visual_touched = sorted(
        f for f in files
        if f.startswith("apps/client/src/components/") or f.endswith(".module.css")
    )
    if client_visual_touched:
        transcript_path = data.get("transcript_path")
        mentioned = True  # fail open if we can't check
        if transcript_path:
            try:
                with open(transcript_path, "r", encoding="utf-8") as fh:
                    mentioned = "screenshot" in fh.read().lower()
            except OSError:
                mentioned = True
        if not mentioned:
            warnings.append(
                "Component/style file(s) changed with no screenshot mentioned yet: "
                + ", ".join(client_visual_touched[:5])
                + ". See design.md's visual process gate and git.md's PR screenshot "
                "requirement."
            )

    if warnings:
        print("pre-stop-check reminders:", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
        return 2  # forces one continuation to surface the reminder, then stops looping

    return 0


if __name__ == "__main__":
    sys.exit(main())
