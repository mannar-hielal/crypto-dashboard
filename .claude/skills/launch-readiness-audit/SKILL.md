---
name: launch-readiness-audit
description: Use when the user asks "is cryptopapertrade ready to launch", "what's left before public release", "ship it", "beta readiness", or wants a gap analysis to launch. Cross-checks docs/SEO_READINESS.md, docs/APP_LOG.md Legal & Compliance + roadmap sections, docs/NEWSLETTER_ADMIN_PLAN.md, and the docs/DRAWING_TOOLS.md UI-only list against the codebase. Produces a tiers-blocker / important / polish audit.
---

# Launch Readiness Audit — cryptopapertrade.com (free-only launch)

Goal: a clear, citable gap analysis for shipping the **free, paper-trading-only** product (Phases 1–4). Phase 5+ (Bybit live trading) and Phase 6 (AI trading bot) are explicitly out of scope.

Source docs to read before producing the audit:

- `docs/SEO_READINESS.md` (Tier 1–4 + Infrastructure & pre-launch + Completed)
- `docs/APP_LOG.md` — sections "⚖️ Legal & Compliance Status", "🗺️ Phase Roadmap", "📋 Planned (Next)"
- `docs/NEWSLETTER_ADMIN_PLAN.md` — compose + send UI marked ⏳ Pending
- `docs/DRAWING_TOOLS.md` — "What's UI Only (Not Wired)"
- **`bug-sweep`** skill — flagged items in P1–P12 still latent (was `docs/REVIEW_CHECKLIST.md`; consolidated into the skill as the single source of truth)
- `README.md` — public claims, must stay in sync

## Audit procedure

For each item below, grep/read the codebase and the cited doc, then output: ✅ Done · 🟡 Partial · 🔴 Missing/Blocker. Cite `file:line` where possible.

### 🔴 Tier 1 — Blockers (public launch cannot ship with these open)

1. **Visual source-of-truth** — ✅ resolved (2026-09-24): `docs/screenshots/theme/` never existed and `docs/markup-reference/` has since been removed; `.claude/conventions/design.md`'s hierarchy (`apps/client/src/lib/tokens.ts` first, the Figma file via `.claude/skills/figma-theme-source` second) is now the actual, working canonical reference, and `session-bootstrap`/`design.md` have been updated to point there directly instead of to the removed paths.
2. **SEO Tier 1** (from `SEO_READINESS.md`): verify each unchecked item — robots/sitemap, OG/Twitter cards, canonical URLs, JSON-LD, page titles. Mark each verified with a citation.
3. **Launch plan** (SEO_READINESS Tier 4): channels, messaging, target audience defined? Not code — but flag as a missing artifact.
4. **Production security headers**: Helmet HSTS `includeSubDomains`, CSP whitelist (no `unsafe-inline`/`unsafe-eval`), `corsOrigin` ≠ `*`. (`bug-sweep` P2-40 Production-Readiness — currently unverified.) Audit `apps/server/src/app.ts`.
5. **`pnpm run audit` clean** — no high/critical CVEs at launch. Run and report.
6. **Authenticated WebSocket JWT via header** (Phase 3+): not required for free-only market data, but flag if any authed WS route is added mid-launch.
7. **Legal blocking items** (APP_LOG "Blocking — Resolved" + "Important — Pending Phase 5"): confirm all "Resolved" items are still resolved; the 🟡 items (e.g. legal entity registration) are flagged for **Phase 5 real-money** path and are NOT blockers for the free paper-trading launch. Be explicit so they don't get conflated.
8. **Free-only enforcement**: verify no UI path lets a user reach real-money trading. Confirm the Phase 5/6 endpoints aren't mounted / aren't reachable.
9. **Email verification + reset-password flows**: pass `bug-sweep` P2 (anti-enumeration P2-32, rate limit P2-29/30, no password in response P2-14). Smoke test happy + error paths.
10. **Reset account + disk hygiene**: `paperStore.reset()` clears accounts cleanly; `cd-paper-trading`, `cd-layout`, `cd-drawings`, `cd-paper-col-prefs` localStorage keys all migrate-or-discard gracefully when the schema bumps.

### 🟡 Tier 2 — Trust & conversion

11. Landing page (`/`) + Features page (`/features`) — confirmed present and styled per `tokens.ts`?
12. Newsletter: subscribers table ✅; **compose + send UI pending** per `NEWSLETTER_ADMIN_PLAN.md`. Decide: ship the landing without broadcast, or finish composer first.
13. SEO Tier 2: trust badges, social proof, FAQ, contact/legal links.
14. `README.md` matches reality — no removed tools (Crosshair, Rectangle, Fibonacci) advertised; drawing tools status (text, freehand UI-only) not overstated.

### 🟢 Tier 3 — Performance

15. Bundle size, code-splitting for `/dashboard` vs public pages, PWA service worker config (`VITE_PWA_DEV_SW`), Lighthouse pass. (SEO_READINESS Tier 3.)
16. WebSocket reconnect behavior under poor network; `usePaneFeeds` 4-connection limit, `MAX_BARS = 1000`, `SNAPSHOT_SIZE = 500` caps intact.

### 🟢 Tier 4 — Polish

17. Drawing tools: ship trendline/horizontal/vertical/ray/parallel as advertised. **Don't ship the UI-only buttons** (Text, Freehand, Polyline) without wiring — either wire them, hide them, or mark them "coming soon" explicitly in UI. (See `drawing-tools` skill for the wiring path.)
18. Cosmetic exit-order Type label mismatch (Order History shows `MARKET` vs TVP's `Take Profit`) — ship or visibly track in-app.
19. Tests: every ⬜ in `docs/TRADING_TEST_PLAN.md` turned to ✅ or consciously deferred.

## Output format

```
# cryptopapertrade.com — Launch Readiness (free-only)

Date: <today>
Scope: Phases 1–4. Phase 5 (Bybit live) OUT. Phase 6 (AI bot) OUT.

## 🔴 Blockers (n=<N>)
1. <item>  evidence: file:line  →  <one-line remedy>
…

## 🟡 Important (n=<N>)
…

## 🟢 Polish (n=<N>)
…

## Verdict
[Ship | Ship with deferred | Do not ship yet] — one paragraph rationale.

## Suggested next 3 moves
1. …
2. …
3. …
```

Do not implement any of the fixes. This skill reports; the user instructs implementation.
