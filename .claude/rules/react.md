---
paths:
  - 'apps/client/src/**/*.tsx'
  - 'apps/client/src/**/*.ts'
---

# React Conventions (Senior React Developer)

Scope: `apps/client/src/**`. Stack: React 19 + Vite 8 + Tailwind v4 + Zustand + `lightweight-charts`.

## TypeScript-strict specifics (client only)

- `verbatimModuleSyntax: true` — always `import type { ... }` for type-only imports (or inline
  `import { type Foo }`). Never a bare `import { Foo }` for a type.
- `erasableSyntaxOnly: true` — no `enum`, no `namespace`. Use `as const` arrays/objects for
  enum-like values instead.
- `noUnusedLocals` / `noUnusedParameters` are both errors — no dead bindings.
- Path alias `@/` = `./src/` (set in `tsconfig`, `vite.config.ts`, `vitest.config.ts`) — no deep
  relative chains (`../../../..`) when `@/` reaches the same file.
- `pnpm --filter @crypto-dashboard/client type-check` must pass before any client change ships.

## Component design

- Props interfaces are defined directly above the component that uses them (co-located) — only
  move to a shared types file when genuinely shared across components.
- Sub-components used in a list or repeated block are extracted to **named functions outside**
  the parent's render body (e.g. `JournalRow`) — defining a component inline inside a parent's
  render creates a new identity every render and defeats reconciliation/memoization.
- `key` props on list items use a stable unique id (`entry.id`, `pos.id`) — never the array index.
- Module-level constants (Framer Motion `variants` objects, static config) are declared **outside**
  the component, not recreated inline on every render.
- No inline `style` props except for genuinely dynamic values sourced from `@/lib/tokens` — no
  hardcoded hex, font strings, or font sizes in a component. Canvas-based libs (lightweight-charts)
  read `tokens.ts` directly instead of Tailwind classes.
- New UI components use CSS Modules (`*.module.css`, camelCase class names). Existing
  Tailwind-utility components are left as-is — don't rewrite them opportunistically.

## Hooks & effects

- Every `useEffect` that creates or subscribes to something (timers, WebSocket, chart primitives)
  returns a cleanup function that tears it down. React 19 StrictMode double-mounts in dev
  (mount → cleanup → mount again) — an effect without cleanup accumulates stale
  subscriptions/primitives across remounts.
- Async work started inside an effect guards its `setState`/store-action calls with an
  `isMountedRef` check (or an abort flag) so a resolved promise from an unmounted component never
  writes state.
- When intentionally closing a WebSocket in cleanup, set `.onclose = null` **before** calling
  `.close()` — otherwise the auto-reconnect handler fires after an intentional disconnect.
- Never call `setState` unconditionally inside an effect that reacts to the state it just set —
  that's an infinite render loop. Trace the dependency chain before adding a new effect dependency.
- **No `setState` during render.** If you need behavior keyed to a prop change, prefer resetting
  via `key={prop}` on the parent instead of a conditional `setState` call mid-render — the latter
  forces an extra render and behaves unpredictably under concurrent rendering.
- Keep `useEffect` dependency arrays accurate: no missing deps (stale closures) and no
  over-broad deps that re-fire the effect on unrelated renders.
- Extract non-trivial business logic out of a hook into a plain, pure function. Hooks are hard to
  unit-test in isolation; a pure helper (e.g. `checkTPSL`) can be tested with zero
  React/store setup. See [`testing.md`](./testing.md).

## Zustand state management

- Subscribe with **fine-grained selectors**: `useStore((s) => s.specificField)`. Never call
  `useStore()` with no selector — that re-renders the component on every state change in the store.
- Extract stable action functions individually (`const placeOrder = useStore((s) => s.placeOrder)`)
  rather than destructuring the whole store — avoids unnecessary re-renders from unrelated actions
  changing identity.
- The four `paneStores[0..3]` are vanilla stores built with `createStore` from `zustand` (not
  `create`) — they're consumed via `useStore(paneStores[i], selector)`, not a generated hook.
- Any store with `persist()` has a `version` number and a `migrate` function. A new required field
  added to persisted state requires bumping `version` and handling the pre-migration shape
  gracefully — malformed/older localStorage must never crash the app on hydration.
- Every persisted or unbounded array on a store (`history`, `orders`, `journal`, etc.) is capped
  on every `set` (`.slice(0, MAX_*)`) — no array is allowed to grow without bound. Adding a new
  persisted array means adding its cap in the same change.
- Test setup/teardown resets stores via the store's own `reset()` action, never a partial
  `setState({...})` — a partial reset silently leaves newer fields at stale values across tests.

## Store reference

| Store              | File                       | Persisted?             | Notes                                                     |
| ------------------ | -------------------------- | ---------------------- | --------------------------------------------------------- |
| `authStore`        | `src/store/authStore.ts`   | No (memory only)       | Access token lives only in Zustand — never `localStorage` |
| `layoutStore`      | `src/store/layoutStore.ts` | Yes (`cd-layout`)      | Pane config, sync flags, pane sizes                       |
| `paperStore`       | `src/store/paperStore.ts`  | Yes (`cd-paper-state`) | Trading state, versioned migration                        |
| `paneStores[0..3]` | `src/store/paneStore.ts`   | No                     | Vanilla stores — `useStore(paneStores[i], selector)`      |

## Numeric/trading input pattern

Editable price/quantity inputs are `type="text" inputMode="decimal"` with a `.replace(/,/g, '')`
parse step — never `type="number"`, which breaks on locale thousands separators (commas).

## Chart-specific gotchas (see `.claude/skills/lightweight-charts-patterns`, `drawing-tools`)

- Any effect that attaches a chart primitive or series must detach/remove it and clear the ref map
  in its cleanup — StrictMode's double-mount otherwise leaves stale primitives pointing at a
  removed chart, and indicators silently stop rendering.
- Drag-to-grab cursor state is toggled via a DOM `data-dragging` attribute, not React state — keep
  this zero-re-render pattern for high-frequency interaction state (crosshair, dragging).
- Drawing tools come from the forked library in `src/vendor/lightweight-charts-drawing/` (hit
  tests, placement and drag rules live there, per tool kind) — change a tool's behaviour in the fork
  and log it in its README; never re-implement hit-testing or placement in ChartPanel.

## Cross-references

- Chart lifecycle deep dive → `.claude/skills/lightweight-charts-patterns`
- Drawing-tool architecture → `.claude/skills/drawing-tools`
- Trading-logic correctness rules (TP/SL direction, commission math) → `.claude/skills/paper-trading-logic`
- Full pre-commit checklist for anything under `apps/client/src/**` → `.claude/skills/bug-sweep` (P4, P-Drawing, P-ClientTS)
