---
name: pr-review-comments
description: Use whenever the Claude GitHub review bot (login `claude` / `claude[bot]`) has left inline review comments on a cryptopapertrade.com PR — including when the `check-claude-review-threads` hook reports unresolved Claude threads, when a merge is blocked by it, or when the user says "fix the review comments", "claude commented on the PR", "address the inline comments", or `/pr-review-comments <PR#>`. Fetches every unresolved Claude thread, verifies each claim against the code, drafts a fix + test (or a reply if the claim is wrong), then STOPS for the user's approval before any commit, push, reply or thread resolution.
---

# PR review comments — verify, fix, wait for approval

The Claude review bot (`.github/workflows` job `claude-review`) posts inline comments on PRs. They
are findings, not orders: each one is verified, and nothing leaves the machine (commit, push,
GitHub reply, thread resolution) until the user approves.

Why this exists: PR #130 merged to `main` and deployed with two unresolved bot comments, because
the pre-merge check read PR comments and review bodies but not inline review threads. The
`check-claude-review-threads.py` hook now blocks `gh pr merge` while Claude threads are
unresolved, and flags them whenever the session looks at a PR.

## 1. Collect the unresolved Claude threads

```bash
PR=<number>   # or: gh pr view --json number --jq .number   (current branch)
gh api graphql -F o=mannar-hielal -F n=crypto-dashboard -F p=$PR -f query='
query($o:String!,$n:String!,$p:Int!){repository(owner:$o,name:$n){pullRequest(number:$p){
  state headRefName baseRefName
  reviewThreads(first:100){nodes{id isResolved isOutdated
    comments(first:20){nodes{author{login} path line originalLine body url createdAt}}}}}}}'
```

Keep the threads where `isResolved` is false and the first comment's `author.login` is `claude`.
Read the **whole** thread: a later comment may already answer or narrow the first one.
`gh api repos/{owner}/{repo}/pulls/$PR/comments` does **not** give you `isResolved`, and neither
do PR comments or review bodies. Only GraphQL `reviewThreads` does.

## 2. Decide where fixes go

- **PR still open:** fix on its head branch (`headRefName`).
- **PR already merged:** the code is on `develop` (and on `main` too if the release merged).
  Fix it on a new `fix/<kebab-desc>` branch cut from `main` (`.claude/rules/git.md` § Branching),
  with a PR to `develop`. Don't reopen the merged branch.

## 3. Verify each comment before touching code

For every thread, read the cited lines **at the current HEAD of that branch**. The comment was
made on an older commit, so check `git log -L` or the diff to see whether it's already fixed.
Then classify it:

| Verdict              | Meaning                                                   | Action                                        |
| -------------------- | --------------------------------------------------------- | --------------------------------------------- |
| **Valid**            | The failure scenario really happens with the current code | Draft a fix + a test that fails without it    |
| **Already fixed**    | A later commit resolved it                                | Draft a reply citing the commit SHA           |
| **Not a real issue** | The scenario can't happen, or the behavior is intended    | Draft a reply with the evidence (`file:line`) |
| **Out of scope**     | Real but belongs to a later phase or a separate change    | Draft a reply + where it's tracked (plan/doc) |

Don't take the bot's suggested patch as-is. Check it against the rest of the code and the
conventions (`.claude/rules/*`, `api-best-practices`, `paper-trading-logic`, and so on). A
suggested fix can be too blunt; for example, "reset `fetchedAt` to now" on a stale fallback
would serve stale data for a full TTL.

## 4. Draft — then STOP

- Implement valid fixes in the working tree only, each with a test that would fail on the old
  code. UI-affecting fixes still go through the visual Q&A gate (`session-bootstrap`).
- Run the gates: `pnpm type-check` (server and client), `pnpm test`, `pnpm lint`,
  `pnpm format:check`.
- For a refactor-shaped fix, also run `.claude/rules/security.md#verify-a-refactor-is-safe`.
- Write every reply as a draft in your message. Don't post it yet.

Then present, per thread:

```
PR #<n> · <path>:<line> — <one-line claim>
Verdict: Valid | Already fixed | Not a real issue | Out of scope
Evidence: <current code lines / commit SHA>
Fix: <what changed + test name>      (or)      Draft reply: "<text>"
```

End with the gate results and the exact actions awaiting approval (commit message, branch, PR,
replies, threads to resolve). **Then end the turn and wait.** Approval for one batch does not
carry over to the next (`git.md` § Non-negotiable first).

## 5. After the user approves

Do only what was approved, in this order:

1. Commit (conventional prefix, one unit of work) and push. If the PR is merged, open the fix PR
   to `develop` using the full template (`git.md` § Pull requests).
2. Reply on each thread:
   `gh api repos/mannar-hielal/crypto-dashboard/pulls/<PR>/comments/<comment_id>/replies -f body='…'`
   (`comment_id` = the numeric REST id, from `gh api repos/…/pulls/<PR>/comments`). Mention the
   fix commit SHA / fix PR.
3. Resolve the thread:
   `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=<thread id>`
4. Re-run the query from step 1. Zero unresolved Claude threads is what unblocks `gh pr merge`.

## Never

- Resolve a thread whose fix isn't committed and pushed, or whose reply isn't posted.
- Resolve or dismiss a thread just to get past the merge gate.
- Commit, push, reply or resolve without the user's approval in that moment.
- Batch unrelated review fixes with feature work in one commit.
