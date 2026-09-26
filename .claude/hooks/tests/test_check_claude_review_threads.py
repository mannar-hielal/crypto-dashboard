#!/usr/bin/env python3
"""Unit tests for the pure parsing in check-claude-review-threads.py (no `gh`, no network).

Run: python3 .claude/hooks/tests/test_check_claude_review_threads.py

The hook command strings live in this file, not in a Bash tool call, so running it from a
Claude Code session doesn't trip the live hooks (see ../README.md § Testing a script by hand).
"""
import importlib.util
import io
import json
import pathlib
import sys
import unittest
from contextlib import redirect_stderr
from unittest import mock

HOOK = pathlib.Path(__file__).resolve().parent.parent / "check-claude-review-threads.py"
spec = importlib.util.spec_from_file_location("hook", HOOK)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)

MERGE = ("pr", "merge")


def invs(command):
    return [(i["sub"], i["target"], i["repo"]) for i in hook.gh_invocations(command)]


class InvocationDetection(unittest.TestCase):
    """Review thread :27 — only real invocations count, not text that mentions them."""

    def test_plain_merge(self):
        self.assertEqual(invs("gh pr merge 130 --merge"), [(MERGE, "130", None)])

    def test_merge_after_cd_chain(self):
        self.assertEqual(invs("cd /repo && gh pr merge 5 --squash"), [(MERGE, "5", None)])

    def test_commit_message_mentioning_merge_is_ignored(self):
        self.assertEqual(invs('git commit -m "docs: explain the gh pr merge gate"'), [])

    def test_grep_pattern_is_ignored(self):
        self.assertEqual(invs('git log --grep="gh pr merge"'), [])

    def test_heredoc_body_is_ignored(self):
        cmd = "git commit -F - <<'EOF'\nfeat: x\n\ngh pr merge 130 is now gated\nEOF\n"
        self.assertEqual(invs(cmd), [])

    def test_merge_after_heredoc_still_counts(self):
        cmd = "cat > f <<'EOF'\nbody\nEOF\ngh pr merge 7"
        self.assertEqual(invs(cmd), [(MERGE, "7", None)])

    def test_env_prefix(self):
        self.assertEqual(invs("GH_PAGER= gh pr merge 9"), [(MERGE, "9", None)])

    def test_unrelated_gh_command(self):
        self.assertEqual(invs("gh pr list --state open"), [])

    def test_quoted_jq_pipe_does_not_break_parsing(self):
        self.assertEqual(
            invs("gh pr view 12 --json comments --jq '.comments | length'"),
            [(("pr", "view"), "12", None)],
        )


class QuotedSeparators(unittest.TestCase):
    """Review thread :93 — separators inside quotes never split a command."""

    def test_pipe_in_quoted_subject_keeps_target(self):
        self.assertEqual(invs('gh pr merge --subject "Fix | thing" 130'), [(MERGE, "130", None)])

    def test_semicolon_in_quoted_body_keeps_target(self):
        self.assertEqual(invs('gh pr merge --body "a; b" 7'), [(MERGE, "7", None)])

    def test_pipe_in_quoted_title_keeps_create_head(self):
        self.assertEqual(
            invs('gh pr create --title "A | B" --head foo/bar'), [(("pr", "create"), "foo/bar", None)]
        )

    def test_newline_inside_quotes_is_not_a_separator(self):
        self.assertEqual(invs('gh pr merge --body "line1\nline2" 8'), [(MERGE, "8", None)])

    def test_unquoted_newline_is_a_separator(self):
        self.assertEqual(invs("echo hi\ngh pr merge 4"), [(MERGE, "4", None)])

    def test_command_substitution(self):
        self.assertEqual(
            invs("N=$(gh pr view 3 --json number --jq .number)"), [(("pr", "view"), "3", None)]
        )

    def test_unbalanced_quote_falls_back_to_plain_split(self):
        # A shell would reject this command. The fallback still sees the merge, which errs on the
        # side of checking (blocking) rather than letting a merge through unchecked.
        self.assertEqual(invs('echo "oops; gh pr merge 5'), [(MERGE, "5", None)])


class TargetParsing(unittest.TestCase):
    """Review threads :62 and :108 — the PR the command is about, not the current branch."""

    def test_bool_flag_before_number(self):
        self.assertEqual(invs("gh pr merge --auto 130"), [(MERGE, "130", None)])

    def test_quoted_number(self):
        self.assertEqual(invs('gh pr merge "130"'), [(MERGE, "130", None)])

    def test_url_target(self):
        [(_, target, _)] = invs("gh pr merge https://github.com/o/r/pull/42 --merge")
        self.assertEqual(hook.pr_number_from_target(target), 42)

    def test_branch_target(self):
        [(_, target, _)] = invs("gh pr merge feat/x --merge")
        self.assertEqual(target, "feat/x")
        self.assertIsNone(hook.pr_number_from_target(target))

    def test_value_flag_is_not_taken_as_target(self):
        self.assertEqual(invs("gh pr merge --subject 99 12"), [(MERGE, "12", None)])

    def test_value_flag_with_equals(self):
        self.assertEqual(invs("gh pr merge --subject=99 12"), [(MERGE, "12", None)])

    def test_repo_flag(self):
        self.assertEqual(invs("gh pr merge 3 -R other/repo"), [(MERGE, "3", "other/repo")])

    def test_run_view_short_attempt_flag(self):
        self.assertEqual(invs("gh run view -a 2 123456"), [(("run", "view"), "123456", None)])

    def test_attached_short_repo_flag(self):
        self.assertEqual(
            invs("gh pr merge 5 -Rother-org/other-repo --squash"), [(MERGE, "5", "other-org/other-repo")]
        )

    def test_attached_short_value_flag_is_not_target(self):
        self.assertEqual(invs("gh pr merge -t99 12"), [(MERGE, "12", None)])

    def test_no_target(self):
        self.assertEqual(invs("gh pr merge --merge"), [(MERGE, None, None)])

    def test_create_uses_head_branch(self):
        cmd = "gh pr create --base main --head develop --title t --body-file b.md"
        self.assertEqual(invs(cmd), [(("pr", "create"), "develop", None)])

    def test_create_without_head(self):
        self.assertEqual(invs("gh pr create --base develop --title t"), [(("pr", "create"), None, None)])

    def test_run_watch_run_id(self):
        cmd = "gh run watch 36224491693 --exit-status --interval 20"
        self.assertEqual(invs(cmd), [(("run", "watch"), "36224491693", None)])

    def test_checks_interval_value_not_target(self):
        self.assertEqual(
            invs("gh pr checks --watch --interval 30"), [(("pr", "checks"), None, None)]
        )


class RunTargetResolution(unittest.TestCase):
    """Review thread :108 — `gh run <id>` resolves through the run's branch."""

    def test_run_id_resolves_via_head_branch(self):
        calls = []

        def fake_gh(args, cwd):
            calls.append(args)
            if args[:2] == ["run", "view"]:
                return "feat/other"
            if args[:2] == ["pr", "view"]:
                return "77"
            if args[:2] == ["repo", "view"]:
                return "o/r"
            return None

        with mock.patch.object(hook, "gh", fake_gh):
            inv = {"sub": ("run", "watch"), "target": "123", "repo": None}
            self.assertEqual(hook.resolve_pr(inv, "."), ("o/r", 77))
        self.assertIn(["pr", "view", "feat/other", "--json", "number", "--jq", ".number"], calls)

    def test_explicit_number_never_queries_current_branch(self):
        calls = []

        def fake_gh(args, cwd):
            calls.append(args)
            return "o/r" if args[:2] == ["repo", "view"] else None

        with mock.patch.object(hook, "gh", fake_gh):
            inv = {"sub": MERGE, "target": "130", "repo": None}
            self.assertEqual(hook.resolve_pr(inv, "."), ("o/r", 130))
        self.assertFalse(any(a[:2] == ["pr", "view"] for a in calls))


class Pagination(unittest.TestCase):
    """Review thread :35 — threads beyond the first page are seen."""

    def test_second_page_is_read(self):
        def page(nodes, has_next, cursor=None):
            return json.dumps({"data": {"repository": {"pullRequest": {"reviewThreads": {
                "pageInfo": {"hasNextPage": has_next, "endCursor": cursor},
                "nodes": nodes}}}}})

        def thread(login, path, resolved=False):
            return {"isResolved": resolved,
                    "comments": {"nodes": [{"author": {"login": login}, "path": path, "line": 1}]}}

        pages = [page([thread("claude", "a.py", resolved=True)], True, "C1"),
                 page([thread("claude", "b.py"), thread("someone", "c.py")], False)]
        seen = []

        def fake_gh(args, cwd):
            seen.append(args)
            return pages[len(seen) - 1]

        with mock.patch.object(hook, "gh", fake_gh):
            self.assertEqual(hook.unresolved_claude_threads("o/r", 1, "."), ["b.py:1"])
        self.assertIn("after=C1", seen[1])


class Dedupe(unittest.TestCase):
    """Several gh calls that resolve to the same PR produce a single report."""

    def test_one_report_per_pr(self):
        cmd = "gh pr checks 5; gh pr view 5 --json state; gh run view 9"

        def fake_gh(args, cwd):
            if args[:2] == ["run", "view"]:
                return "feat/x"
            if args[:2] == ["pr", "view"]:
                return "5"
            if args[:2] == ["repo", "view"]:
                return "o/r"
            return json.dumps({"data": {"repository": {"pullRequest": {"reviewThreads": {
                "pageInfo": {"hasNextPage": False}, "nodes": [{"isResolved": False, "comments": {
                    "nodes": [{"author": {"login": "claude"}, "path": "a.py", "line": 1}]}}]}}}}})

        err = io.StringIO()
        payload = {"hook_event_name": "PostToolUse", "tool_input": {"command": cmd}, "cwd": "."}
        with mock.patch.object(sys, "stdin", io.StringIO(json.dumps(payload))), \
             mock.patch.object(hook, "gh", fake_gh), redirect_stderr(err):
            self.assertEqual(hook.main(), 2)
        self.assertEqual(err.getvalue().count("PR #5 has"), 1)


class FailOpen(unittest.TestCase):
    """Review thread :106 — an unknown/missing event never runs the check."""

    def run_main(self, payload):
        with mock.patch.object(sys, "stdin", io.StringIO(json.dumps(payload))), \
             mock.patch.object(hook, "gh", side_effect=AssertionError("gh must not be called")), \
             redirect_stderr(io.StringIO()):
            return hook.main()

    def test_missing_event(self):
        self.assertEqual(self.run_main({"tool_input": {"command": "gh pr merge 1"}}), 0)

    def test_unknown_event(self):
        self.assertEqual(
            self.run_main({"hook_event_name": "Stop", "tool_input": {"command": "gh pr merge 1"}}), 0
        )

    def test_pre_tool_use_ignores_non_merge(self):
        self.assertEqual(
            self.run_main({"hook_event_name": "PreToolUse", "tool_input": {"command": "npm test"}}), 0
        )


if __name__ == "__main__":
    unittest.main(verbosity=1)
