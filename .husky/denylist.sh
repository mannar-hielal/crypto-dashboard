#!/bin/sh
# 🔐 IP: runs scripts/denylist-check.sh <mode…> (the benchmark-name check) for the hooks.
# The script of the checkout being committed in or pushed from, a worktree's own copy: with an
# absolute core.hooksPath every worktree runs the main checkout's hook files, so a hook's own
# directory isn't the right one. Falls back to the script next to this file. So a branch that
# edits the script runs its own edit: the check guards against mistakes, not against someone
# changing it (they could as well skip it with --no-verify); review covers the script itself.
DENYLIST="$(git rev-parse --show-toplevel)/scripts/denylist-check.sh"
[ -f "$DENYLIST" ] || DENYLIST="$(dirname "$0")/../scripts/denylist-check.sh"
exec sh "$DENYLIST" "$@"
