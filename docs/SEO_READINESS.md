# SEO & Marketing Readiness Checklist

## Tier 1 — Blocking (must do before public launch)

- [x] **robots.txt + sitemap.xml** — Place in `apps/client/public/`. Sitemap lists all 9 indexable public routes. Excludes `/dashboard`, `/unverified`, verify routes.
- [x] **Install `react-helmet-async`** — Set unique `<title>` + `<meta name="description">` on every public page component.
- [x] **OG + Twitter Card meta tags** — Default values in `index.html`, per-page overrides via react-helmet-async. `og-image.svg` (1200×630) placeholder created.
- [x] **`<link rel="canonical">`** — Static fallback in `index.html`, dynamic per-page via `SeoHead` component.
- [x] **Per-page meta titles** — Unique titles set on all 15 public pages (see `SeoHead.tsx` for full list).

## Tier 2 — Trust & conversion

- [x] **Privacy policy link in cookie banner** — Link to `/privacy`.
- [x] **Social proof on landing page** — Trust badges strip (SSL encryption, no real money, Bybit live data).
- [ ] **Social / community links in Footer** — X, Discord, GitHub (create accounts if needed).
- [x] **Newsletter / "Get Notified" CTA** — `NewsletterForm.tsx` wired into `CtaSection.tsx`'s non-live branch.

## Tier 3 — Performance

- [x] **Code splitting** — `React.lazy()` for all route pages in `App.tsx`.
- [x] **Lazy-load images** — `loading="lazy"` on below-the-fold images in `LandingPage.tsx`.

## Tier 4 — Content & growth

- [ ] **Blog / educational content** — 3–5 articles ("What is paper trading?", "How to read candlestick charts").
- [ ] **Backlink strategy** — Product Hunt, relevant subreddits, paper trading comparison sites, GitHub.
- [x] **Competitive differentiation** — Visible USP on landing page (real-time Bybit data, free, no sign-up wall). Done 2026-10-03: hero "Live crypto charts. No signup." → `/chart`; landing retitled "Free Live Crypto Charts & Paper Trading" (Bybit only as the data source); `/chart` description no longer promises trading without an account.

## Infrastructure & pre-launch

- [x] **Analytics** — Cloudflare Web Analytics installed (cookieless, no GDPR consent needed). GA4 deferred until post-launch when conversion tracking is needed.
- [ ] **Lighthouse audit** — Score 90+ Performance, 100 SEO.
- [ ] **Test all auth flows** — Signup → verify → login → dashboard end-to-end.
- [ ] **Mobile responsiveness** — Landing + dashboard on multiple device sizes.
- [ ] **PWA install test** — End-to-end on desktop and mobile.
- [ ] **`.well-known/` files** — DMARC, email deliverability setup.
- [ ] **Launch plan** — Channels, messaging, target audience defined.

---

## ✅ Completed

- [x] **Retire "Under Construction" splash** — Root `/` rendered `UnderConstructionPage` pre-launch; replaced by the real `LandingPage` on 2026-06-17. The app is now live in production.
- [x] **Brand logo (`public/logo.svg`)** — Created from `og-image.svg` design (purple-indigo gradient, bottom-aligned CPT). Replaced all inline CPT brand marks in TopBar, LegalLayout, auth pages, and UnderConstructionPage.
- [x] **Favicon (`public/favicon.svg`)** — Updated to match the brand logo (same gradient, same bottom-aligned CPT).
- [x] **PWA icons (`pwa-192x192.png`, `pwa-512x512.png`)** — Regenerated from the new logo, replacing the old candlestick chart design.
