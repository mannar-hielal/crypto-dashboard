# Guided Trade — MVP Plan

> **Owner:** Mannar Hielal · **Written:** 2026-09-30 · **Status:** ⏸ deferred (owner, 2026-09-30) — not started,
> with Q1–Q3 below unanswered on purpose. First deferred until the test plan was done (2026-09-29); with that done,
> the owner deferred it again. Nothing here is scheduled: pick it up only when the owner asks, starting with Q1–Q3.
>
> Moved here from the test implementation plan (retired 2026-09-30): its scenario format, the per-section "Guided
> trade" verdicts, the Rollout milestone and its Q1 / Q2. The UI reproductions in `docs/UI_REPRODUCTIONS.md` are
> the step-by-step source for each tour; `docs/TRADING_TEST_PLAN.md` Part B holds the cases they cite.

## What it is

An in-app overlay that walks a learner through a real trade on live prices: it highlights one control at a time,
shows a short explanation next to it, and moves on when the learner does the step themselves. The tours reuse the
scenario steps that drive the Playwright tests, so a tour and its test can't drift apart.

## What already exists

- **Anchors** — `apps/client/src/lib/guideAnchors.ts`: the typed `data-guide` registry and `guide()`. Every anchor is
  a real control, never a wrapper, and ships to production. Renaming one breaks tours: add the new name, migrate,
  then remove.
- **Scenario format** — `apps/client/src/guide/scenario.ts` and `steps.ts`: `Scenario` / `ScenarioStep` (see
  `.claude/rules/testing.md`, "End-to-end tests"). The tour-relevant fields are `explain` (the bubble text),
  `liveNote` (the "what you should see" line on live prices), `testOnly` (price-control steps the tour skips) and
  `tour: { stage, order }` (absent = not offered as a tour).
- **Scenarios** — `apps/client/src/guide/scenarios/`: `spotMarketBuy.ts` and `perpMarketLong.ts`, the two MVP tours.

## MVP scope

`GuideOverlay` over the two existing scenarios:

1. **"Your first Spot market order"** — `spot-market-buy` (cases 14.6.1, 14.6.8).
2. **"Your first long"** — `perp-market-long` (Section 1, steps 1–5).

**Done when** a learner completes both tours on live prices (on desktop; phones depend on Q3).

## The overlay — `apps/client/src/guide/GuideOverlay.tsx`

- Loads a scenario by id (lazy import), drops `testOnly` steps and preconditions of kind `quote` (the tour runs on
  live prices).
- For each step: finds `[data-guide="<anchor>"]` (+ key), scrolls it into view, draws a highlight ring and a bubble
  with `explain` next to it (position from `getBoundingClientRect` + `ResizeObserver`; no new dependency needed —
  `@floating-ui/react` is the fallback and would go through the supply-chain check first).
- Advances on the user's own action: `click` → a click on the anchor; `type` → an input event (the step's `value`
  is shown as a suggestion, any valid value is accepted); `observe` → a **Next** button. `expect` is not asserted in
  the tour; the `liveNote` becomes the bubble's "what you should see" line.
- If an anchor isn't on screen (panel collapsed, mobile layout), the bubble says what to open first.
- The UI change goes through the visual Q&A gate (`.claude/rules/design.md`) before it is built.

## Tour catalogue (after the MVP)

The verdict for every Part B section, from the per-section review in the retired test implementation plan. "Steps"
refers to that section's reproduction in `docs/UI_REPRODUCTIONS.md`. Stage 6 (under the hood) has no tours — its
reproductions are tester procedures.

| Stage | Section                                   | Tour?  | Tour(s)                                                                                                                          |
| ----- | ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 0     | 19 — Account flows                        | partly | "Create your account" (steps 2–4); the rest are settings, not trading                                                            |
| 0     | 8 — Account Settings modal                | no     | a settings check; a one-bubble hint on the reset is enough                                                                       |
| 0     | 14.1 — Market URLs and the Trade menu     | yes    | "Find your market" (steps 1–3), first tour of Stage 0                                                                            |
| 0     | 10.1–10.3, 10.5 — Multi-chart layout      | partly | "Watch several charts" (steps 1–4), optional                                                                                     |
| 0     | 5 — Symbol pair icons                     | no     | —                                                                                                                                |
| 0     | 9 — Sell / Buy prices and spread          | yes    | "Read Sell, Buy and the spread" (steps 2–3), last tour of Stage 0                                                                |
| 1     | 14.6 — Spot                               | yes    | **"Your first Spot market order"** (MVP, steps 1–6); "Sell and see your profit" (8–9); "Protect a Spot buy with TP / SL" (12–13) |
| 2     | 4 — Panels, journal, sounds, Orders bench | partly | "Your journal" (step 4); the rest is panel housekeeping                                                                          |
| 2     | 7 — Order History tab                     | yes    | "Follow an order from placement to history" (steps 1–5; 4 is a waiting step on live prices)                                      |
| 3     | 1 — Market orders                         | yes    | **"Your first long"** (MVP, steps 1–5); "Going short" (step 6); "Mistakes the form catches" mini-tour (step 7)                   |
| 3     | 2 — Limit orders                          | yes    | "Enter at your price with a limit order" (steps 1–2, 4); "A full bracket" (2–5)                                                  |
| 3     | 3 — Stop orders                           | yes    | "Catch a breakout with a stop order" (steps 1–2)                                                                                 |
| 3     | 4.17–4.18 — Editing TP / SL               | yes    | "Move your take-profit" (step 2)                                                                                                 |
| 3     | 14.5 — Per-symbol leverage                | yes    | part of "Set your leverage and margin mode" (with 15.5 and 17.5)                                                                 |
| 3     | 14.2–14.4 — Fees, fill prices, size rules | partly | "What a trade costs" (steps 1–2); steps 3–4 are tester checks                                                                    |
| 3     | 15.2 — One-way mode                       | yes    | "Adding to a position" (one step, after "Your first long")                                                                       |
| 4     | 15.1 — Mark price                         | yes    | "Mark price vs last price" (steps 1–2, observe-only on live prices)                                                              |
| 4     | 15.3 / 15.4 — Liquidation                 | yes    | "What liquidation means" — observe-only on live prices: explain the numbers on the form and the row, never force one             |
| 4     | 15.5 — Re-margining on a leverage change  | yes    | "Change leverage on an open position"                                                                                            |
| 4     | 15.6 — Chart lines                        | partly | "Manage a trade from the chart" (step 2) once drag works on touch; desktop-only today                                            |
| 4     | 17.1 — Add / reduce margin (isolated)     | yes    | "Add margin to survive a move"                                                                                                   |
| 4     | 17.2 — Trigger source, reduce-only        | partly | "Reduce-only closes, never opens" (step 2); trigger source is advanced                                                           |
| 4     | 17.3 — Risk tiers                         | no     | reference information, not an action                                                                                             |
| 4     | 17.4 — Closed P&L                         | yes    | "Take partial profit and read Closed P&L"                                                                                        |
| 5     | 16 — Funding                              | yes    | "What funding costs you" (observe-only, steps 1 and 3; step 2 explained, not forced)                                             |
| 5     | 17.5 — Cross margin                       | yes    | "Cross or Isolated?" (steps 1–2)                                                                                                 |
| 5     | 11 — Multi-symbol PnL                     | yes    | "Trade two symbols side by side" (steps 1–3)                                                                                     |
| 5     | 10.4 — Sync options                       | partly | "Compare timeframes" (steps 1, 3), for chart-minded learners                                                                     |
| 5     | 4.19–4.20 — Multi-pane TP / SL incidents  | no     | —                                                                                                                                |

## Risks

- **Anchors are a public contract.** Renaming one silently breaks tours and tests. Mitigation: the typed registry,
  the unused-anchor check, and a rename = add, migrate, remove.
- **Live prices move under the learner.** Steps with exact numbers become "what you should see" formulas
  (`liveNote`); see Q2.

## Open questions for the owner

Deferred with the feature (2026-09-30): answered when the owner picks it up, not before.

- **Q1.** Opt-in from a "Learn" menu, or offered once to new accounts? Does progress need saving per user (server)
  or is the browser enough?
- **Q2.** Tours run on live prices, so steps with exact numbers become "what you should see" formulas. Is that the
  experience you want, or should a tour run against a practice feed?
- **Q3.** Phones are a supported trading flow since 2026-09-29 (rows 20.1–20.4), and the order form is a full-screen
  view or a sheet there. Should the MVP tours run on phones too, with the bubble telling the learner to open the
  order form first — or desktop only at first?
