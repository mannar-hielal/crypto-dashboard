---
name: add-page
description: Use whenever a new page or route is added to cryptopapertrade.com, or an existing one is renamed/removed — marketing/landing pages, legal pages, blog/guide/content pages, auth or transactional pages, dashboard/admin pages. Walks the full checklist so nothing is forgotten — classify the page, process gates (explicit instruction + visual Q&A), route + lazy import in App.tsx, layout choice, SeoHead title/description/canonical/noIndex, sitemap.xml, robots.txt, internal links, legal/CSP impact, tests, APP_LOG/SEO_READINESS docs, PR, and post-deploy indexing in Google Search Console / Bing. Trigger words: new page, add a page, new route, landing page for X, blog post page, guide page, rename page, remove page, move URL.
---

# Add a Page — cryptopapertrade.com

A new page touches more than a component: the route, SEO meta, the static sitemap, internal links,
possibly legal text and the CSP, and — after deploy — search-engine indexing. This skill is the
single checklist for all of it. Work through the steps in order; the page type decided in Step 1
tells you which steps apply.

## Step 1 — Classify the page

| Type                       | Examples                                                      | Indexable? | Route location in `App.tsx`                   | `SeoHead`          | Sitemap |
| -------------------------- | ------------------------------------------------------------- | ---------- | --------------------------------------------- | ------------------ | ------- |
| **Public – indexable**     | `/`, `/features`, `/chart`, legal pages, blog/guide           | Yes        | Public section (top of `<Routes>`)            | full, no `noIndex` | Yes     |
| **Public – transactional** | `/verify-email`, `/newsletter/unsubscribe`, `/reset-password` | No         | Public section                                | `noIndex`          | No      |
| **Authenticated**          | `/dashboard`                                                  | No         | Inside `<Route element={<ProtectedRoute />}>` | `noIndex`          | No      |
| **Admin**                  | `/admin/newsletter`                                           | No         | Inside `<ProtectedRoute />`                   | `noIndex`          | No      |

Admin pages are UI only — `ProtectedRoute` checks login, not admin rights. Every admin API endpoint
must enforce admin access **server-side** (pattern: the `ADMIN_EMAIL` check in
`apps/server/src/routes/newsletter/index.ts`; config in `apps/server/src/config.ts`).

## Step 2 — Process gates (before writing anything)

From `.claude/skills/session-bootstrap` — non-negotiable:

1. **No implementation without explicit instruction.** Propose the page (type, URL, layout, title,
   description, where it's linked from) and wait for a go-ahead.
2. **Visual Q&A gate** per `.claude/conventions/design.md` before any UI work. Source of truth:
   `apps/client/src/lib/tokens.ts` first, then the Figma file via `.claude/skills/figma-theme-source`.

Also decide the **URL** now: lowercase, hyphenated, short, keyword-bearing (`/paper-trading-guide`,
not `/Guide1`). URLs are hard to change later without a redirect (see Step 9).

## Step 3 — Code

Follow `.claude/conventions/react.md`.

1. **Page component**: `apps/client/src/pages/<Name>Page.tsx`, **named export** (`export function
<Name>Page()`).
2. **Route**: in `apps/client/src/App.tsx`
   - add a lazy import next to the others:
     `const <Name>Page = lazy(() => import('@/pages/<Name>Page').then((m) => ({ default: m.<Name>Page })));`
   - add the `<Route>` in the section matching the Step 1 type — always **above** the catch-all
     `<Route path="*" …>`, which must stay last.
3. **Layout** — reuse, don't rebuild:
   - legal/policy text → `LegalLayout` (`apps/client/src/components/LegalLayout.tsx`, see `SecurityPage.tsx`)
   - login/register-style forms → `AuthLayout` (`apps/client/src/components/AuthLayout.tsx`)
   - marketing/content → `<TopBar marketing />` (`apps/client/src/components/dashboard/TopBar.tsx`)
     rendered as a sibling **above** `AuthLayout`
     (see `LandingPage.tsx` / `FeaturesPage.tsx`; don't put it inside `AuthLayout`)
4. **`<SeoHead>`** (`apps/client/src/components/SeoHead.tsx`) as the first child of every page:
   ```tsx
   <SeoHead title="…" description="…" path="/your-path" /* noIndex for non-indexable types */ />
   ```
   - `title`: unique, ≤ ~60 chars, main keyword first. The ` | cryptopapertrade.com` suffix is
     appended automatically — don't repeat it.
   - `description`: unique, ~140–160 chars, a reason to click, includes the target phrase.
   - `path`: always pass it explicitly — it becomes the canonical URL and `og:url`.
   - `noIndex`: required for transactional, authenticated and admin pages.
5. **Semantic structure**: exactly one `<h1>`; `<h2>`/`<h3>` in order without skipping levels;
   meaningful `alt` on every image (`alt=""` only for decorative ones); real text, not text baked
   into images; below-the-fold images get `loading="lazy"`.

## Step 4 — Discoverability (indexable pages only)

1. **`apps/client/public/sitemap.xml`** — static file, nothing generates it. Add:
   ```xml
   <url>
     <loc>https://cryptopapertrade.com/your-path</loc>
     <lastmod>YYYY-MM-DD</lastmod>
     <changefreq>monthly</changefreq>
     <priority>0.7</priority>
   </url>
   ```
   Always the apex `https://cryptopapertrade.com` — never `www.` (it 301s to apex) and no trailing
   slash unless the route has one.
2. **`apps/client/public/robots.txt`** — nothing to do for public pages (`Allow: /` covers them).
   Add a `Disallow:` line only for new private/transactional paths.
3. **Internal links** — a page nothing links to (an "orphan") ranks poorly even if it's in the
   sitemap. Link it from at least one of: `apps/client/src/components/Footer.tsx`, the marketing
   `TopBar`, `/features`, or a related content page. Use react-router `<Link to="…">` with
   descriptive anchor text (not "click here").

## Step 5 — Legal & security impact

Answer each; if "yes", do the linked work in the same PR.

- **Collects any user data** (form, email, upload)? → update `apps/client/src/pages/PrivacyPage.tsx`
  (what's collected, legal basis, retention); any new server endpoint needs validation and rate
  limiting per `.claude/conventions/web.md` and `.claude/conventions/security.md`.
- **Loads a new third-party origin** (script, iframe, font, API, image CDN)? → CSP:
  `script-src`/`img-src`/etc. in `apps/client/index.html`, `connect-src` via `cspConnectSrcPlugin` in
  `apps/client/vite.config.ts`; add the processor to Privacy §9 and Terms §10. Exact origins only,
  no wildcards.
- **Sets cookies or uses tracking**? → the privacy page currently promises no tracking cookies; this
  needs a consent decision with the user first. Stop and ask.

## Step 6 — Tests

Per `.claude/conventions/testing.md`: any page with logic, a form, or interaction gets tests
(extract logic into pure functions and test those first). A purely static content page may not need
one — if you skip tests, state that explicitly in the PR's test section.

## Step 7 — Docs & PR

1. `docs/APP_LOG.md` — add an entry (`### feat: … (YYYY-MM-DD) ✅` with problem, changes, gates).
2. `docs/SEO_READINESS.md` — update the counts in the Tier 1 lines ("Sitemap lists all N
   indexable public routes", "Unique titles set on all N public pages").
3. Branch `feat/<short-kebab>` cut per `.claude/conventions/git.md`; run the `bug-sweep` skill in
   Mode B on the diff; PR to `develop` with the full template (screenshots required — it's UI).
   Commit/push/PR only when the user explicitly asks.

## Step 8 — After deploy (indexable pages)

Deploy happens on the `develop → main` merge. Then:

1. `curl -s -o /dev/null -w "%{http_code}\n" https://cryptopapertrade.com/your-path` → `200`.
2. **Google Search Console** → URL Inspection (top search bar) → paste the full URL →
   **Request indexing**.
3. **Bing Webmaster Tools** → nothing if Cloudflare Crawler Hints (IndexNow) is on; otherwise
   **URL Submission**.
4. Tell the user to check back in ~1 week: Cloudflare Web Analytics → Top pages shows visits;
   Search Console → Indexing → Pages shows it as **Indexed**.

## Step 9 — Renaming or removing a page

Because of the known soft-404 gap below, an old URL does **not** return 404 on its own. For every
renamed or removed indexable page:

- add a 301 in `apps/client/public/_redirects` **above** the SPA fallback line:
  `/old-path  /new-path  301` (removed page → the closest relevant page);
- update the `sitemap.xml` entry, internal links, and any `SeoHead` `path`;
- after deploy, URL-Inspect the new URL and request indexing.

## Known site-wide gaps — warn, don't fix here

These affect every new page. Mention the relevant ones in your proposal/PR, but don't fix them
inside an add-page task — each is its own change. **Delete an item from this list once it's fixed.**

1. **No prerendering.** Pages render client-side; the raw HTML for every URL is the same
   `index.html`. Google renders JS, but X/LinkedIn/Discord/Slack/WhatsApp previews, most AI
   crawlers and often Bing see the homepage title/description. Matters most for content/blog pages.
2. **`og-image.svg` is SVG.** X, Facebook and LinkedIn don't render SVG `og:image` — shared links
   show no image. Needs a 1200×630 PNG/JPG.
3. **Soft 404s.** `App.tsx` catch-all `*` → `<Navigate to="/" replace />` plus `_redirects`
   `/* /index.html 200` means unknown URLs return 200 with homepage content. Search Console reports
   these as "Soft 404"; renames need explicit 301s (Step 9).

## Output format

When done (or when proposing), report as a checklist:

```markdown
## add-page: /your-path (<type>)

- [x] Step 2 — gates: instruction ✓, visual Q&A ✓
- [x] Step 3 — page, route, layout (<which>), SeoHead (title N chars, description N chars), h1
- [x] Step 4 — sitemap ✓, robots N/A (public), linked from Footer.tsx
- [x] Step 5 — no data collected, no new origins — N/A
- [ ] Step 6 — N/A: static content, no logic (stated in PR)
- [x] Step 7 — APP_LOG ✓, SEO_READINESS counts ✓, PR #NNN
- [ ] Step 8 — pending deploy: request indexing in Search Console
- ⚠️ Known gaps relevant here: <e.g. no prerendering — social previews show homepage meta>
```
