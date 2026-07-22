# TV Sweep — Implementation Plan

> Recommendations extracted from `tv-website-full/` (TradingView codebase) analysis, grounded in **Exgen Figma tokens** (file `XnbW6uGFwCVYzz3MGGCjFM`), skipping light/dark theme support.

---

## P0 — Token Expansion (tokens.ts)

**Current state**: 7 background vars, 11 color vars, 4 font-size vars. No palette scale.

**What to add** (all values from Exgen Figma, not TV):

| Token group | Fields                                                                                                               | Source                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `bg`        | `card`, `input`, `header`, `sidebar`, `modal`, `tooltip`                                                             | Figma Spot buy / Markets / AI pages (bg: `#050212`, panels: `#25234e`/`#3e3c73`) |
| `color`     | `purpleLight`, `purpleMuted`, `greenDark`, `greenLight`, `redDark`, `redLight`, `gray50`→`gray900` (cold-gray scale) | Figma frames (Spot buy buttons, Markets table, AI page accents)                  |
| `border`    | `default`, `hover`, `active`, `input`, `divider`, `card`                                                             | Figma card/input borders from Spot buy/Markets                                   |
| `toolbar`   | `buttonBg`, `buttonBgHover`, `buttonBgActive`, `buttonIcon`, `buttonIconActive`, `buttonText`, `divider`             | New — adapt from current panel bg + opacity                                      |
| `shadow`    | `card`, `dropdown`, `modal`, `tooltip`                                                                               | Figma effects on card/popup frames                                               |
| `zIndex`    | `dropdown`, `tooltip`, `modal`, `toast`, `drawingOverlay`                                                            | New — needed for drawing tools overlay                                           |

**File**: `apps/client/src/lib/tokens.ts`

---

## P1 — Keyboard-Only Focus Ring

**Problem**: Buttons show focus ring on mouse click (ugly).

**Pattern from TV** (`12385.*.css`):

```css
.button:focus:not(:focus-visible)::after {
  display: none;
}
.button::after {
  border: 2px solid var(--color-focus-outline-color-blue);
  /* offset -5px, size calc(100% + 10px) */
}
```

**Action**: Add a shared `focusRing` utility to `tokens.ts` or a `focus-ring.css`:

```ts
export const focusRing = {
  width: '2px',
  offset: '3px',
  color: color.purple, // or color.purpleDark
  radius: 'inherit',
} as const;
```

**Files**: `apps/client/src/lib/tokens.ts`, `apps/client/src/index.css` (add `@utility focus-ring`)

---

## P1 — Composable Button System

**Problem**: Multiple button variants (LeftToolbar icons, TradingPanel CTAs, chart toolbar) use different inline styles.

**Pattern from TV**: `.lightButton` + modifier classes (`.link-`, `.typography-regular16px-`, `.ltr-`).

**Action**: Create a `Button` component in `apps/client/src/components/ui/Button.tsx` with:

| Prop      | Values                                                                 |
| --------- | ---------------------------------------------------------------------- |
| `variant` | `'ghost'` (toolbar icon), `'primary'` (CTA), `'secondary'`, `'danger'` |
| `size`    | `'xs'` (toolbar, 28px), `'sm'` (32px), `'md'` (40px), `'lg'` (48px)    |
| `active`  | `boolean` — highlighted toggle state (for drawing tools)               |

Each variant maps to `tokens.ts` colors. Focus ring applied via `:focus-visible`.

---

## P1 — Size Scale System

**Problem**: Toolbar buttons, chart controls, panel headers all have ad-hoc sizing.

**Pattern from TV** (`65900.*.css`): Single `--size` var drives border-radius, height, border-width through calc:

```css
--size: 4; /* medium */
border-radius: calc(... * 14px +... * 20px +...);
height: calc(... * 28px +... * 40px +...);
```

**Action**: Add size scale to `tokens.ts`:

```ts
export const size = {
  xs: 2, // 28px — toolbar icon buttons, badge counts
  sm: 3, // 34px — small panel controls
  md: 4, // 40px — default button height
  lg: 5, // 48px — primary CTAs
  xl: 6, // 56px — large inputs
  xxl: 7, // 80px — hero elements
} as const;
```

Then apply via CSS custom property or component prop.

---

## P1 — Drawing Tool Hit Testing & Anchors

**Problem**: Current `useDrawingInteraction` hit test is basic point-in-rectangle.

**Pattern from TV** (`lt-pane-views.*.js`):

- **Segmented hit testing**: `hitTest()` on each renderer returns `HitTestResult` with target type + cursor
- **Anchor rendering**: `LineAnchorPaneView` with `RegularAnchorRadius(6)` / `TouchAnchorRadius(13)` + adaptive stroke width
- **CompositeRenderer pattern**: `append(childRenderer)` → batch draw

**Action** (`apps/client/src/lib/drawing/`):

1. Create `types.ts` with:

   ```ts
   export enum HitTarget { MovePoint, ChangePoint, Regular, None }
   export interface HitTestResult { target: HitTarget; pointIndex?: number; cursor?: PaneCursorType }
   export enum PaneCursorType { Default, Pointer, Eraser, Grabbing, ZoomIn, Crosshair, ... }
   ```

2. Create `CompositeRenderer.ts`:

   ```ts
   export class CompositeRenderer implements ISeriesPrimitive {
     private renderers: ISeriesPrimitive[] = [];
     append(r: ISeriesPrimitive) {
       this.renderers.push(r);
     }
     // delegates dataUpdated(), requestUpdate(), etc. to all children
   }
   ```

3. Add `interactionTolerance()` config to `tokens.ts`:

   ```ts
   export const interaction = {
     tolerance: { series: 4, anchor: 6, curve: 4 },
     anchorRadius: { regular: 6, touch: 13 },
     anchorStroke: { regular: 1, touch: 3, selected: 3 },
   } as const;
   ```

4. Update `LineAnchorRenderer.ts` to use the new config.

---

## P2 — Toolbar Button Variant (Ghost/Active)

**Problem**: `LeftToolbar` icon buttons need consistent active/hover states.

**Action**: Add `toolbar` tokens to `tokens.ts`:

```ts
export const toolbar = {
  buttonBg: 'transparent',
  buttonBgHover: bg.surface, // or rgba white 0.08
  buttonBgActive: color.purple, // active tool highlight
  buttonIcon: color.muted,
  buttonIconActive: color.white,
  buttonIconHover: color.white,
  divider: 'rgba(255,255,255,0.08)',
  height: '40px', // toolbar row height
} as const;
```

**Files**: `apps/client/src/components/dashboard/LeftToolbar.tsx`, `apps/client/src/lib/tokens.ts`

---

## P2 — CSS Class Naming Convention

**Problem**: Mixed naming across `index.css` (Tailwind utilities), component CSS modules, and inline styles.

**Pattern from TV**: Content-hashed class names (`.lightButton-kjRfTlfx`) via CSS modules.

**Action**: Enforce CSS Modules for all new components. Existing components remain Tailwind utility-first. Document in AGENTS.md:

> All new UI components MUST use CSS Modules (`*.module.css`) with camelCase class names. No inline style props except for dynamic values from `tokens.ts`.

---

## P2 — WebSocket Protocol (Reference)

**Problem**: Phase 6 AI bot will need robust WS connections.

**Pattern from TV** (`index.html:158`): Custom socket.io:

- Protocol prefix `~m~<length>~<payload>` with `~h~` heartbeats
- `~j~` prefix for JSON messages
- Session-based with `setTimeout` idle timeout
- `send()` batches arrays into a single frame

**Action**: Document in `docs/api-best-practices.md` or `docs/WEBSOCKET_PATTERNS.md` for Phase 6 reference. No implementation yet.

---

## P3 — Chunk Splitting with Preload Hints

**Problem**: Drawing tool JS loads in one bundle.

**Pattern from TV**: 41 CSS + 26 JS bundles, each with `<link rel="preload" as="script">` before the `<script defer>`.

**Action**: Vite already handles code-splitting by route. Add `preload` hints for drawing tool chunk in `index.html` when it becomes large enough:

```html
<link rel="preload" href="/assets/drawing-<hash>.js" as="script" crossorigin />
```

---

## Skipped (Explicitly)

| Item                                         | Reason                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| **Light/dark theme**                         | Not needed — single dark theme only                          |
| **~800 CSS custom properties**               | Would bloat tokens.ts; only add what components actually use |
| **Template blocks** (`{ block css_bundle }`) | Our Vite setup doesn't use Jinja templates                   |
| **Theme persistence API** (save/load themes) | Single theme, no user-customizable palettes                  |

---

## Execution Order

```
Phase 1 (this session)
  └─ P0 — Token expansion (tokens.ts)
  └─ P1 — interactionTolerance, HitTestResult types
  └─ P1 — CompositeRenderer pattern
Phase 2
  └─ P1 — Composable Button component
  └─ P1 — Size scale system
  └─ P2 — Toolbar button tokens + LeftToolbar update
Phase 3
  └─ P1 — Keyboard-only focus ring
  └─ P2 — CSS Modules convention enforcement
Phase 4 (drawing tool feature)
  └─ P2 — Anchor rendering with touch-aware sizing
  └─ P2 — Cursor type enum + angle-based resize cursors
```
