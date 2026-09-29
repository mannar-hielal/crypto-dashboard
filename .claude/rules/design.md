---
paths:
  - 'apps/client/src/**/*.tsx'
  - 'apps/client/src/**/*.css'
  - 'apps/client/src/lib/tokens.ts'
---

# Design & Styling Conventions (Senior UX Designer)

Scope: visual language, layout, motion, and accessibility for `apps/client`. Dark-mode-only
fintech dashboard (Exgen visual system) — Tailwind v4 + CSS Modules + `lightweight-charts` canvas.

## Source-of-truth hierarchy — check in this order

1. **`apps/client/src/lib/tokens.ts`** — the single source of truth for every color, font, size,
   radius, shadow, and z-index value. Check here first; the value you need may already exist under
   a different but equivalent semantic name. Never introduce a second token for the same intent.
2. **Figma file "Exgen – Crypto Exchange Dashboard Template – Fintech & AI"**
   (file key `XnbW6uGFwCVYzz3MGGCjFM`) — the canonical _visual_ source of truth for anything not
   yet in `tokens.ts`:
   `https://www.figma.com/design/XnbW6uGFwCVYzz3MGGCjFM/Exgen-–-Crypto-Exchange-Dashboard-Template-–-Fintech---AI`
   Access it via the Figma MCP (`figma_*` tools, declared in `opencode.json`), never by guessing
   values from memory. See `.claude/skills/figma-theme-source` for the full frame/node-ID map
   (landing, sign-in, spot/futures trade panels, markets, etc.) and the sampling workflow.
3. **Never** sample from the loose root-level `Screenshot 2026-07-14 *.png` files or from
   `docs/screenshots/theme/` — the latter is referenced by `docs/APP_LOG.md`/`AGENTS.md` but does
   not exist in the repo. Treat any such reference as stale and redirect to Figma.
   (`docs/markup-reference/` — the former secondary reference for component anatomy/interaction
   structure — was removed 2026-09-24; Figma now covers that ground too.)

No hex value, font string, font size, or px measurement is ever hardcoded directly in a component.
If Figma and `tokens.ts` disagree, `tokens.ts` (Figma-derived) wins — flag the doc as stale rather
than silently reconciling it.

## Tokens at a glance (from `apps/client/src/lib/tokens.ts`)

The full, authoritative list is the file itself — this table is a quick-reference snapshot so a
value doesn't need to be re-derived from Figma if it's already minted. Sampled from Figma node IDs
noted in `.claude/skills/figma-theme-source` (e.g. `93:5177` = Sign in / auth flow frame).

| Token                             | Value                                              | Role                                 |
| --------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `bg.deep`                         | `#03020a`                                          | Deepest tone — cover/base background |
| `bg.page`                         | `#060413`                                          | Page / chart canvas background       |
| `bg.navy`                         | `#081129`                                          | Secondary background tone            |
| `bg.panel`                        | `#25234e`                                          | Panel / header / card background     |
| `bg.surface` / `bg.input`         | `#3e3c73`                                          | Elevated surface / input field       |
| `color.green`                     | `#2ccd78`                                          | Profit / buy / positive              |
| `color.red`                       | `#d5455c`                                          | Loss / sell / negative               |
| `color.purple`                    | `#a555e2`                                          | Primary accent (vibrant)             |
| `color.purpleDark`                | `#695bec`                                          | Accent — hover states, borders       |
| `color.muted`                     | `#cac5d4`                                          | Secondary / muted text               |
| `color.white`                     | `#fcfcfd`                                          | Headline / bright text               |
| `gradient.brand`                  | `linear-gradient(90deg, #FE4BD1 0%, #3F5FF5 100%)` | Primary CTA / brand gradient         |
| `font.sans`                       | `'Geist Variable', ui-sans-serif, sans-serif`      | Body/UI typeface                     |
| `fontSize.xs11` → `fontSize.base` | `13px` → `18px`                                    | Panel body text → largest UI text    |
| `radius.button`                   | `25px`                                             | Pill radius — CTA / primary buttons  |
| `focusRing.color`                 | `color.purpleDark` (2px, 3px offset)               | Keyboard focus indicator             |

Chart-canvas colors (`chart.*` — separate palette, see below) and the full border/shadow/z-index/
interaction tables are intentionally left out of this snapshot; read `tokens.ts` directly for those.

## Color system

- `bg.*` — surface hierarchy from deepest to most elevated: `deep` → `page` → `navy` → `panel` →
  `surface`/`input` → `tooltip`/`modal`/`banner`. Pick the token that matches the surface's
  elevation, not the one that happens to render the right shade today.
- `color.*` — semantic brand/status colors: `green`/`red` are reserved for profit/loss and
  buy/sell polarity and must not be reused for unrelated UI states; `purple`/`purpleDark`/
  `purpleDeep` are the primary accent ramp; `amber`/`warning`/`warningLight` are the warning ramp;
  `muted`/`white` are the text ramp.
- `chart.*` is a **separate, flat palette** used only for canvas-rendered content
  (`lightweight-charts` cannot read CSS custom properties). Indicator lines, candle colors, and
  chart text/background all live here — do not point a chart series at a Tailwind class or a
  `color.*`/`bg.*` token; add a new `chart.*` entry instead, and keep `chart.bg` in sync with
  `bg.page`.
- `border.*` and `shadow.*` are opacity-scaled overlays (`rgba(255,255,255,0.0x)`), not new hues —
  follow that pattern for any new border/shadow token rather than inventing a flat color.
- `gradient.brand` (`#FE4BD1 → #3F5FF5`) is reserved for primary CTAs, the login hero, and brand
  marks — it is a visual "primary action" signal and loses meaning if used decoratively elsewhere.

## Typography

- `font.sans` = Geist Variable (loaded via `@fontsource-variable/geist`); `font.mono` for
  numeric/code contexts.
- `fontSize.*` is a fixed 0.75×-scaled ramp (`xxs`/`xs10` = 11px, `xs11` = 13px, `xs` = 14px,
  `sm` = 16px, `base` = 18px) purpose-built for this dashboard's information density — use the
  token whose comment matches the UI role (badge/legend/panel-body/etc.), not the one that happens
  to produce the desired pixel size.
- `lineHeight.*` (`tight` 1.2 / `snug` 1.375 / `normal` 1.5) — tighter line-heights are for dense
  tabular/chart UI, `normal` for prose/marketing copy.

## Spacing, size & layering

- `size.*` is a Tailwind spacing-unit scale (`xs`=2 through `xxl`=7, i.e. ×4px) for control
  heights — pick by role (`md` = default button height, `lg` = primary CTA), not by eyeballing a
  pixel value.
- `radius.button` (`25px`, pill) is reserved for primary/CTA-style buttons — most panel chrome is
  square-cornered by default (Tailwind's default radius scale), so don't apply the pill radius to
  panels/cards without a specific reason.
- `zIndex.*` defines the stacking order (`dropdown` 50 → `tooltip` 100 → `modal` 200 → `toast` 300
  → `drawingOverlay` 400) — a new overlay layer is inserted at the correct point in this order,
  never given an arbitrary large number that jumps the stack.

## Interaction & motion

- `focusRing.*` defines the keyboard-only focus treatment (2px purple ring, 3px offset) — this is
  the only focus indicator; don't add a second ad hoc `outline`/`box-shadow` for focus.
- `toolbar.*` centralizes hover/active states for icon-button toolbars — reuse it for any new
  toolbar rather than redefining hover opacity per component.
- `interaction.*` (hit-test tolerance, anchor radius/stroke, touch vs. pointer sizing) governs
  drawing-tool affordances — touch targets are deliberately larger (`anchorRadius.touch: 13` vs.
  `regular: 6`); preserve that ratio for any new interactive chart handle.
- Framer Motion `variants` objects are declared at module scope, not inside the component (see
  [`react.md`](./react.md#component-design)) — this is a styling-consistency rule as much as a
  perf one, since inline variant objects drift out of sync with each other across components.
- The app is **dark-mode only** (`color-scheme: dark` set globally) — don't design or gate a
  feature on a light-theme variant that doesn't exist yet.

## Component styling implementation

- New UI components use **CSS Modules** (`*.module.css`, camelCase class names,
  e.g. `Button.module.css`). Existing Tailwind-utility components are left as-is — don't migrate
  them opportunistically as a side effect of an unrelated change.
- Tailwind utilities for brand colors (`bg-bg-panel`, `text-brand-green`, `hover:text-brand-purple`,
  `focus:border-brand-purple-dark/50`, …) are generated from the `@theme inline` block in
  `index.css`, which must mirror `tokens.ts` 1:1 — a token added to `tokens.ts` without its
  `--color-*` mirror in `index.css` is unusable from Tailwind class names.
- No inline `style` props except for values pulled dynamically from `tokens.ts` at runtime
  (e.g. an indicator color chosen by user selection).

## Accessibility

- Keyboard focus is always visible via `focusRing` — never suppress `:focus-visible` styling.
- Profit/loss and buy/sell signaling leans on `color.green`/`color.red` alone in some surfaces;
  when adding a _new_ profit/loss surface, pair color with a directional icon or +/- prefix rather
  than color alone, for color-vision-deficient users.
- Body text uses `-webkit-font-smoothing: antialiased` globally — don't override per-component.
- Respect existing `size.*` control heights for interactive elements (buttons, inputs) — shrinking
  a tap target below the `sm`/`md` scale hurts touch usability on the trading panels.

## Responsive layout (phones and tablets)

Agreed with the owner on 2026-09-29 ("support phone trading"). The dashboard's breakpoints:

- **Below `sm` (640 px, phones):**
  - the top bar shows the CPT logo without the wordmark, and the avatar without the username;
  - no ticker tape, no multi-pane layout picker or sync status;
  - the account panel is titled "Orders & Account";
  - the footer keeps the paper-trading disclaimer and the legal links.
- **Below `lg` (1024 px, phones and tablets):**
  - the order form isn't docked beside the chart: `MobileTradeBar` (Buy / Long, Sell / Short) opens it, full screen
    below `md` and as a 320 px right-hand sheet from `md` (768 px);
  - a placed order closes it and opens the account panel;
  - the symbol bar's Trade toggle shows from `lg` only.
- **No sideways page scroll at any width.** Rows that scroll (the symbol bar, the tables) scroll inside their own
  container.
- **Buttons with a colored fill** (green / red) use dark text (`bg.page`): white on `color.green` is ~2:1.
- Check a layout change at 375, 412, 820 and 1440 px (`e2e/tests/mobile/layout.spec`, the `@mobile` projects).

## Process gate — do this before any visual change

Per `.claude/skills/session-bootstrap`'s non-negotiable #2: **before** touching spacing, color,
size, layout, or interaction on any component, run a visual Q&A with the user first — quote
`tokens.ts` or the Figma frame (via `.claude/skills/figma-theme-source`) as the reference, and do
not invent a value to fill a gap. This applies even to "small" tweaks — a 2px padding change is a
visual decision.

## Cross-references

- Token sampling workflow, Figma frame/node map → `.claude/skills/figma-theme-source`
- Component/hook implementation conventions that consume these tokens → [`react.md`](./react.md)
- The visual Q&A non-negotiable + missing `docs/screenshots/theme/` caveat →
  `.claude/skills/session-bootstrap`
