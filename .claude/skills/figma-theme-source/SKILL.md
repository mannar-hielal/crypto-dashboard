---
name: figma-theme-source
description: Use for any visual / styling / spacing / color / layout / typography decision on cryptopapertrade.com — the canonical visual source of truth is the Figma file "Exgen – Crypto Exchange Dashboard Template" (file key XnbW6uGFwCVYzz3MGGCjFM), accessed through Claude Code's Figma connector. Also use when the user asks "what color/size/font does this use", "sample this from Figma", "is our UI consistent with the mockup", or when docs/APP_LOG.md references the now-missing docs/screenshots/theme/ — redirect to Figma. Never guess a hex or font string; always mint it from Figma into apps/client/src/lib/tokens.ts first.
---

# Figma — canonical theme source for cryptopapertrade.com

The project's `docs/APP_LOG.md` references `docs/screenshots/theme/` as the primary visual source of truth, but **that directory does not exist** — only two loose root-level `Screenshot 2026-07-14 *.png` files do. The real source of truth is this Figma file:

- **File**: Exgen – Crypto Exchange Dashboard Template – Fintech & AI
- **URL**: `https://www.figma.com/design/XnbW6uGFwCVYzz3MGGCjFM/`
- **File key**: `XnbW6uGFwCVYzz3MGGCjFM`

Use Claude Code's Figma connector (the `mcp__claude_ai_Figma__*` tools) — never fabricate values. Start each task with `create_session` for file key `XnbW6uGFwCVYzz3MGGCjFM`, and pass its session id to the other calls.

## How to use

### Step 1 — always read the live token registry first

Before sampling anything from Figma, open `apps/client/src/lib/tokens.ts`. It already carries Exgen-sourced values (see comment markers like `Exgen bg solid`, `Exgen gradient start`, `Exgen card bg`, `Exgen glow`, `Exgen headline`). Anything you need may already be there or a sibling value may be the right alias. Do not duplicate.

### Step 2 — pick the Figma frame matching the surface

| Surface                    | Frame               | Node ID                           |
| -------------------------- | ------------------- | --------------------------------- |
| Cover / global bg          | Cover (canvas)      | `2007:4597`                       |
| Prototype root             | Prototype (canvas)  | `93:4906`                         |
| Landing / dashboard        | Home Page           | `93:5009`                         |
| Sign in                    | Sign in             | `2054:4766`                       |
| Verification Sent / Code   | Auth flows          | `2066:4695` / `2066:4744`         |
| Trading right panel (buy)  | Spot buy            | `93:5515`                         |
| Trading right panel (sell) | Spot sell           | `93:6003`                         |
| Leverage / futures         | Futures buy / sell  | `93:7352` / `93:7840`             |
| Buy Crypto / Sell Crypto   | Funding trade UI    | `93:6804` / `93:7210`             |
| Convert                    | Convert / Convert 2 | `93:6491` / `2014:18239`          |
| Deposit / Withdraw         | Funding             | `93:6550` / `93:6711`             |
| Bank Transfer (3 variants) | Funding             | `93:6936` / `93:7030` / `93:7121` |
| Markets (symbol tables)    | Markets             | `93:9350`                         |
| Opportunities / watchlist  | Opportunities       | `93:9406`                         |
| News                       | News (×2)           | `93:9202` / `93:9294`             |
| AI bot page                | AI                  | `93:5290`                         |
| FAQ / legal                | FAQ Section         | `93:5172`                         |

### Step 3 — inspect with the Figma connector

- **Session first**: `create_session` with `fileKey: 'XnbW6uGFwCVYzz3MGGCjFM'` and a one-line task; reuse its session id.
- **Visual scan**: `get_screenshot` for a node, to compare a frame's layout.
- **Structure** (when you don't know which frame, or to read a frame's children): `get_metadata` with the node id.
- **Style detail** (colors, fonts, sizes, spacing, layout modes): `get_design_context` with the node id (load the `figma-design-to-code` skill first, as the connector requires). Its output is a reference to adapt to `tokens.ts`, not code to paste.
- **Variables and styles**: `get_variable_defs`. This file publishes few or no library styles (colors and fonts are inline per element), so sample from specific nodes, not from a style library.

### Step 4 — read the values off the connector's output

- **Colors:** `get_design_context` gives reference code with hex (or rgba) values, and `get_variable_defs` the file's variables by name. Take the value as given; if a color comes as normalized `{r,g,b,a}` floats, convert with `'#' + [r,g,b].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('')` (plus the alpha byte when `a < 1`).
- **Backgrounds:** most outer frames on this file carry a hidden or workspace fill; the rendered fill is on an inner frame, so read the node one or two levels down (`get_metadata` lists the children).
- **Type and spacing:** font family, weight, size, line height and letter spacing, and padding / gap, as the reference code states them. Check a doubtful value against `get_screenshot` of the same node.
- Note the node ID each value came from: Step 6 cites it.

### Step 5 — reconcile against `tokens.ts` before proposing an edit

Compare the sampled value to the existing token with the same intent. Examples already in `tokens.ts`:

- `bg.deep` `#03020a` (Exgen bg solid; matches Figma canvas solid)
- `bg.page` `#060413` (Exgen gradient start)
- `bg.navy` `#081129` (Exgen gradient end)
- `bg.panel` `#25234e` (Exgen card bg)
- `color.glow` `#6662a9` (Exgen glow)
- `color.white` `#fcfcfd` (Exgen headline)
- `gradient.brand` `linear-gradient(90deg, #FE4BD1 0%, #3F5FF5 100%)` (Exgen brand CTA)

Discrepancy to flag the user: `docs/APP_LOG.md` "Background palette" section says `#0f0e29` (page), `#211e49` (panel/header), `#1e1d34` (footer), `#3e3c73` (input/card); `tokens.ts` says `bg.page #060413`, `bg.navy #081129`, `bg.panel #25234e`, `bg.surface #3e3c73`, `bg.footer #1e1d34`. The Figma-derived values in tokens.ts are the truth. The APP_LOG snippet is stale — propose a doc edit when you next update APP_LOG, don't silently align.

### Step 6 — propose changes, never write them yourself

Per the project rule (⛔ no implementation without explicit instruction), the workflow is:

1. Read the relevant Figma frame(s) and the relevant `tokens.ts` block.
2. Output a diff sketch — old vs new, with file:line citations and the source Figma node ID (and the connector call) each value came from.
3. If a brand-new semantic class is needed (e.g. `color.fuchsia`), propose the name + the value + the comment marker format used elsewhere in `tokens.ts` (e.g. `// Exgen <role>: #NNNNNN`).
4. Wait for the user to approve before editing `tokens.ts`.
5. Do not edit `index.css` Tailwind theme (`@theme inline`) without the user's go-ahead — the CSS utilities derive from tokens.ts, so the order is always tokens.ts first.

## Rules

- Never invent a color/font/size. If the MCP call fails or returns the value as `visible: false`, descend to a deeper child until you find the actual rendered fill / type style. State the Node ID you sampled so the user can verify.
- Loose repo-root screenshots (`Screenshot 2026-07-14 at *.png`) are **not** the source of truth — they are dev previews. Don't sample from them.
- Whenever `session-bootstrap` flags the missing `docs/screenshots/theme/`, redirect here. Consider proposing an APP_LOG edit that replaces the `docs/screenshots/theme/` reference with the Figma URL when the user is ready.
