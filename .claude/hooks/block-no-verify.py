#!/usr/bin/env python3
"""PreToolUse (Bash) — hard-blocks bypassing git safety hooks or commit signing.

Encodes the repo-wide rule (restated as the non-negotiable in
.claude/conventions/git.md) that hooks are never skipped and commits are
never left unsigned without the user explicitly asking for that *exact*
exception — something this hook can't verify from the command string alone,
so it blocks the bypass flags unconditionally instead. Note: `-n` only means
`--no-verify` for `git commit`, not `git push` (there it means `--dry-run`),
so the two subcommands are checked separately.
"""
import json
import re
import sys


def strip_message_bodies(command):
    """Blank out -m message content (heredoc or simple quoted form) so prose
    inside a commit message — which can legitimately contain the literal text
    "--no-verify" while documenting this very hook — is never mistaken for an
    actual CLI flag. Only text outside the message body is scanned for flags.
    """
    # Heredoc form: -m "$(cat <<'EOF' ... EOF)"
    command = re.sub(r"<<-?['\"]?EOF['\"]?\s*\n.*?\nEOF", "<<EOF MSG EOF", command, flags=re.DOTALL)
    # Simple quoted form: -m "..." / -m '...'
    command = re.sub(r"""(-m\s+)(['"]).*?\2""", r"\1\2MSG\2", command, flags=re.DOTALL)
    return command


def segment(command, subcommand):
    """Return the `git <subcommand> ...` portion of the string, up to the next
    shell separator, or None if that subcommand isn't invoked."""
    m = re.search(rf"git\s+{subcommand}\b([^;&|]*)", command)
    return m.group(0) if m else None


def main():
    data = json.load(sys.stdin)
    command = strip_message_bodies(data.get("tool_input", {}).get("command", "") or "")

    reasons = []

    commit_seg = segment(command, "commit")
    if commit_seg and re.search(r"--no-verify\b|(?:^|\s)-n\b|--no-gpg-sign\b", commit_seg):
        reasons.append("`git commit` with --no-verify/-n/--no-gpg-sign")

    push_seg = segment(command, "push")
    if push_seg and re.search(r"--no-verify\b", push_seg):
        reasons.append("`git push` with --no-verify")

    if re.search(r"-c\s+commit\.gpgsign=false", command):
        reasons.append("commit.gpgsign=false override")

    if reasons:
        print(
            "Blocked: this command bypasses a git safety hook or commit signing "
            f"({'; '.join(reasons)}). Never skip hooks or signing unless the user "
            "explicitly asked for that exact exception in this turn "
            "(see .claude/conventions/git.md).",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
