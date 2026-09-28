# Git, Branching & PR Conventions

Scope: commit messages, branch naming, and pull-request process for cryptopapertrade.com. There is
no `.github`/`docs` PR template file anymore — the template is reproduced verbatim in
[Pull requests](#pull-requests) below, which is now the single source of truth for PR structure.

## Non-negotiable first

Per `.claude/skills/session-bootstrap`: **never** run `git commit`, `git push`, or open a PR
without the user explicitly asking for that specific action in that moment. A prior approval to
commit does not carry forward to the next change — confirm each time.

## Commit messages

- One prefix, colon, one-line subject: `type: subject`.
- **Canonical prefixes**: `feat:`, `fix:`, `security:`, `chore:`, `setup:`, `docs:`, `refactor:`,
  `test:` — the union of what `AGENTS.md` documented and what the old PR-template checklist used,
  reconciled here now that this file is the one place both lived.
- Before committing a `refactor:`, run
  [`security.md`'s refactor-safety checklist](./security.md#verify-a-refactor-is-safe) against the
  diff — "no behavior change" is a claim, not a fact, until that check has been done.
- One testable unit of work per commit — don't batch unrelated changes into one commit just
  because they landed in the same session.
- Real examples from history: `fix: pin undici override to 7.x to unbreak jsdom in client tests`,
  `security: close audit findings — session revocation, timing equalization, CSP, rate limits`,
  `feat: add TVP-style range switcher with auto interval switch, interval dropdown, and
new timeframes` — specific and scoped to what actually changed, not a generic "update files."
- `security:` exists as its own category (distinct from `fix:`) specifically so security-motivated
  changes are easy to find in `git log` later — use it whenever the change's primary purpose is
  closing a vulnerability or hardening a control, even if the diff also touches application logic.

## Branching & PR flow

Two long-lived branches: `main` (production — every merge to it deploys, see CI/CD below) and
`develop` (integration). The flow between them:

1. **A PR always targets `develop`, never `main` directly.** `main` only ever receives commits via
   a `develop → main` merge — an individual feature/fix PR is not the mechanism for reaching `main`.
2. **`develop` gets merged into `main`** as its own, separate step once the accumulated work on
   `develop` is ready to ship — that merge is what actually deploys.
3. **A new feature/fix branch is cut from `main`**, on the assumption that `develop` has already
   been merged into `main` (the normal steady state right after a release, where the two point at
   the same commit) — so `main` is the up-to-date base. If that assumption doesn't hold — `develop`
   is currently ahead of `main` with unreleased commits the new work depends on — branch from
   `develop` instead, so that in-flight work isn't invisible to the new branch. Check
   `git log main..develop` (or the GitHub compare view) first if it's unclear whether the two are
   in sync.

Branch names follow `<type>/<short-kebab-description>`, mirroring the commit prefixes —
`feat/drawing-tools`, `feat/landing-page`, `feat/seo-work`, `feat/prepare-for-launch`,
`fix/user-auth-and-dev-impovements` — never created ad hoc from whatever branch happens to be
checked out.

## CI/CD pipeline — what a branch/PR actually triggers

- `ci.yml` runs on every push to `main`/`develop` and on every PR targeting `main`/`develop`:
  `pnpm audit` → type-check (server) → `format:check` → `lint` → `test:coverage` (the suites plus
  the coverage floors) + `test:hooks` → build. This main job mirrors the local pre-commit hook (see
  [`testing.md`](./testing.md#gates--what-passing-means-before-a-commitpr)), so a change that passes
  locally should pass it too. A separate **Integration (Postgres)** job runs `test:int` (migrations
  from empty, schema drift, repository round-trip); it needs a database, so it runs in CI only
  (locally: `test:int` against a throwaway Postgres). All jobs must be green before merge — every
  feature/fix PR (targeting `develop`) and the later `develop → main` release merge go through the
  identical gate, and the deploy waits for the whole workflow, so a failing integration job blocks
  a release.
- `deploy.yml` triggers only after CI **succeeds on `main`** (`workflow_run` on the CI workflow,
  filtered to `branches: [main]`) and deploys the exact commit SHA CI validated
  (`ref: ${{ github.event.workflow_run.head_sha }}`) — never a newer, unvalidated commit that may
  have landed on `main` in the interim. Merging `develop` into `main` is a production deploy, not
  a formality.

## Pull requests

A feature/fix PR targets `develop`; a release PR targets `main` from `develop` (see
[Branching & PR flow](#branching--pr-flow) above). **Every PR uses this exact body — regardless of
whether it's a feature/fix branch → `develop` PR or a `develop` → `main` release PR.** There is no
auto-populated GitHub template anymore, so write this out (or paste it) each time:

```markdown
## 📋 What does this PR do?

<!-- One sentence summary -->

## 🔗 Related issue / ticket

<!-- Closes #XX or N/A -->

## ✅ Type of change

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `security` — Security hardening
- [ ] `chore` — Tooling / dependencies
- [ ] `docs` — Documentation only
- [ ] `refactor` — Code refactor (no behavior change)
- [ ] `test` — Tests added or updated

## 🧪 How to test

<!-- Step-by-step for the reviewer to verify -->

1.
2.

## 📸 Screenshots (if UI change)

<!-- Drag & drop or N/A -->

## 🔒 Security / DevOps checklist

- [ ] No secrets or credentials committed
- [ ] Input is validated / sanitized
- [ ] Rate limiting still applies where needed
- [ ] No new `console.*` — logger used instead
- [ ] ESLint + Prettier pass locally
- [ ] Type-check passes (`pnpm type-check`)
- [ ] Tests pass (`pnpm test`)
```

Fill in every section — an unfilled placeholder or an unchecked checklist box needs an explicit
reason written next to it, not silence. "How to test" is concrete, numbered reviewer steps, never
"tested locally." Screenshots are attached for any UI change — the PR-time complement to the visual
Q&A gate in [`design.md`](./design.md#process-gate--do-this-before-any-visual-change), which
happens _before_ the change is made; the screenshot is the after-the-fact proof for the reviewer.
On a `develop → main` release PR, the checklist still applies in full — re-verify it at the
release boundary, don't assume it already covered by the individual PRs that landed on `develop`.

The checklist items map onto the other convention files:

- No secrets or credentials committed → [`security.md`](./security.md#secrets-management)
- No new `console.*` — logger used instead → [`web.md`](./web.md#logging-discipline)
- Input is validated / sanitized → [`web.md`](./web.md#security)
- Rate limiting still applies where needed → [`web.md`](./web.md#security), [`security.md`](./security.md)
- ESLint + Prettier pass locally, type-check passes, tests pass →
  [`testing.md`](./testing.md#gates--what-passing-means-before-a-commitpr)

## Review comments

The `claude-review` CI job posts **inline review comments** on PRs. A green `claude-review` check
only means the review ran. Its findings live in inline threads, which don't show up in PR
comments or review bodies.

- A PR is not ready to merge while it has an **unresolved Claude review thread**. This applies to a
  feature/fix → `develop` PR and to a `develop` → `main` release PR alike.
- Every thread goes through the [`pr-review-comments`](../skills/pr-review-comments/SKILL.md)
  skill:
  1. verify the claim against the current code;
  2. draft a fix with a test, or draft a reply if the claim is wrong or already fixed;
  3. **wait for the user's approval**;
  4. then commit, reply and resolve.
- Never resolve a thread just to unblock a merge.
- Enforced by `.claude/hooks/check-claude-review-threads.py`:
  - it blocks `gh pr merge` while Claude threads are unresolved;
  - it flags them after `gh pr checks` / `gh pr view` / `gh pr create` / `gh run watch` / `gh run view`.
- Why: PR #130 merged to `main` and deployed with two unresolved findings, because the
  pre-merge check only read PR comments and review bodies.

## Cross-references

- Process non-negotiables (no unrequested implementation, visual Q&A gate) → `.claude/skills/session-bootstrap`
- Pre-commit/PR audit checklist (Mode B) → `.claude/skills/bug-sweep`
- Local gate commands and CI parity → [`testing.md`](./testing.md)
