# Landing Page + Features Page — Build Plan

## Goal

Create two public-facing marketing pages for cryptopapertrade.com:

- `/` → Landing page (the hub for future offers)
- `/features` → Living catalog of all platform features

---

## Page 1: `/` — Landing Page (`LandingPage.tsx`)

The marketing hub that will be iterated on with new offers over time.

### Sections

| Section                | Content                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**               | Gradient brand headline ("Paper trade crypto, free"), subtitle, two CTAs ("Start Trading" → `/register`, "See Features" → `/features`) |
| **Stats strip**        | 3 metrics (9 crypto pairs, real-time Bybit data, $10K virtual balance)                                                                 |
| **Feature highlights** | 3-card grid (Charts, Trading, Data) with icons + brief copy                                                                            |
| **Dashboard preview**  | Visual mockup/screenshot of the dashboard                                                                                              |
| **Final CTA**          | Full-width gradient banner with heading + "Get Started" button                                                                         |

---

## Page 2: `/features` — Features Page (`FeaturesPage.tsx`)

The living catalog of everything the platform does — updated as new features ship.

### Sections

| Section            | Content                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Hero**           | Headline + sticky anchor nav linking to each section                                                                                       |
| **Charts**         | Multi-layout (5 layouts), 6 timeframes, indicators (EMA9/20/200, VWAP, MACD), drawing tools (trend lines, fib, rectangles, text, freehand) |
| **Trading**        | Market/limit/stop orders, TP/SL, position netting, $10K paper balance, leverage 1–10x                                                      |
| **Account**        | Positions table, order history, balance audit trail, trading journal                                                                       |
| **Real-time Data** | Bybit WebSocket feed, 9 crypto pairs, bid/ask spread, connection status indicator                                                          |
| **Cross-platform** | PWA — installable on mobile/desktop, works offline, synced across devices                                                                  |
| **CTA**            | "Start trading in 20 seconds" — link to `/register`                                                                                        |

---

## Changes to `App.tsx`

- Replace `UnderConstructionPage` at `/` → `LandingPage`
- Add `Route path="/features"` → `FeaturesPage`
- Keep `UnderConstructionPage` at `*` for 404 fallback

---

## Implementation Details

- **Wrapper**: Both pages use `AuthLayout` (ambient purple/green glow blobs + grid overlay)
- **Styling**: All colors/fonts from `@/lib/tokens` — no new design tokens
- **Animations**: `framer-motion` — staggered reveal, fade-in-up, scale-on-hover for cards
- **Components**: shadcn `Button` and `Card` from `@/components/ui`
- **Landing page** is intentionally clean/minimal to leave room for future offer banners
- **Features page** has sticky anchor nav at the top for quick section jumping

---

## Files to Create

| File                         | Purpose                      |
| ---------------------------- | ---------------------------- |
| `src/pages/LandingPage.tsx`  | Landing page at `/`          |
| `src/pages/FeaturesPage.tsx` | Features page at `/features` |

## Files to Modify

| File          | Change                  |
| ------------- | ----------------------- |
| `src/App.tsx` | Wire up both new routes |
