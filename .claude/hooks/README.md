# `.claude/hooks/`

Claude Code hooks that mechanically enforce a subset of `.claude/rules/`. Registered in
`.claude/settings.json`. See the plan this was built from for the full rule → hook mapping and the
cleanup rationale: each script's docstring cites the convention file/section it encodes.

## Contract

Every script reads one JSON object from stdin (the fields Claude Code passes for that hook event —
`tool_input`, `cwd`, and for `Stop`, `stop_hook_active`; for `SessionStart`, just `cwd`) and uses a
plain exit code to communicate back:

- **`exit 0`** — allow / no issue. For `SessionStart`, stdout on exit 0 is also injected into the
  session as additional context.
- **`exit 2`** — block. `stderr` is surfaced back to Claude as the reason.
  - For `PreToolUse`, this prevents the tool call from running at all.
  - For `PostToolUse`, the edit already happened — this just relays feedback into the transcript
    so Claude can self-correct in a follow-up edit. Nothing is undone.
  - For `Stop`, this prevents the turn from ending and forces one more continuation carrying the
    reason. `pre-stop-check.py` checks the `stop_hook_active` flag to avoid nagging on a loop for
    its soft (non-mechanical) nudges — only its hard audit-failure gate re-fires on every pass,
    since that one can only clear once actually fixed.

Every check **fails open** on a parsing ambiguity it can't confidently resolve (e.g. a commit
message it can't extract from an unusual shell construct) — these are a faster, earlier catch on
top of the real enforcement (husky's pre-commit/pre-push gates, ESLint, `tsc`), not a replacement
for it. A false negative here still gets caught later; a false positive here would block a
legitimate action, so the scripts lean permissive when uncertain.

## Files

| Script                     | Hook                      | Blocks or warns                                                                                                     |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `check-commit-message.py`  | PreToolUse (Bash)         | Blocks a `git commit` without an allowed prefix                                                                     |
| `block-no-verify.py`       | PreToolUse (Bash)         | Blocks `--no-verify`/`-n`/`--no-gpg-sign`/gpgsign=false                                                             |
| `check-branch-name.py`     | PreToolUse (Bash)         | Blocks a new branch not matching `<feat\|fix>/kebab-desc`                                                           |
| `check-pr-body.py`         | PreToolUse (Bash)         | Blocks `gh pr create` missing a required template section                                                           |
| `scan-staged-secrets.py`   | PreToolUse (Bash)         | Blocks a commit whose staged diff looks like a secret                                                               |
| `block-generated-edits.py` | PreToolUse (Edit\|Write)  | Blocks hand-edits under `apps/server/generated/`                                                                    |
| `post-edit-lint.py`        | PostToolUse (Edit\|Write) | Warns on hardcoded hex, `console.*`, `any`, bare `useStore()`, missing `AbortSignal.timeout`                        |
| `session-start-context.py` | SessionStart              | Injects the non-negotiables + current branch as context                                                             |
| `pre-stop-check.py`        | Stop                      | Blocks on a failing `pnpm audit` if deps changed; warns on untested route/plugin changes or unmentioned screenshots |

## Testing a script by hand

Each script just reads JSON from stdin, so it can be exercised directly without going through
Claude Code:

```bash
echo '{"tool_input":{"command":"git commit -m \"add stuff\""},"cwd":"'"$PWD"'"}' \
  | python3 .claude/hooks/check-commit-message.py; echo "exit=$?"
```

**Careful when testing from inside a live Claude Code session**: these hooks match on the raw
`command`/`file_path` text of _every_ Bash/Edit/Write tool call, including ones used only to
demonstrate or test a pattern (e.g. a test harness whose command string literally contains
`--no-verify`). Write test drivers to a file first and run that file with a clean outer command,
rather than embedding the flagged substrings directly in the Bash tool's `command` argument.
