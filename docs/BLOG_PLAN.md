# Blog — Moving the Articles Out of the Lessons

> **Owner:** Mannar Hielal · **Written:** 2026-11-18 · **Status:** 📝 planned, nothing built. Implementation starts
> only when the owner says go. Branch: `feat/knowledge-base`, cut from `main` after the chapter 1 release (the old
> `feat/lesson-4-…` branch was merged, so it is not reused).

## 1. Goal

All the articles (today the "knowledge base" inside the lessons) move out to a public **Blog** at `/blog`, and are no
longer linked from any card, lesson, path or panel. The public pages get a new header next to the logo:

`cryptopapertrade.com  BETA   Product ▾   Blog   About us   Support`

- **Product ▾** drops down to **Chart** (`/chart`) and **Features** (`/features`).
- **Blog** (`/blog`) is where every article lives.
- **About us** (`/about`) and **Support** (`/support`) are placeholders ("Coming soon") until planned.

## 2. Decisions (owner, 2026-11-18)

| #   | Question                           | Decision                                                                                                        |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Branch                             | New `feat/knowledge-base` from `main`                                                                           |
| 2   | Name and URL                       | **Blog**, `/blog` (articles at `/blog/<slug>`)                                                                  |
| 3   | Term peeks in lessons (`[[term]]`) | **Kept**, without the article link: a tapped term still shows its one-sentence definition and "think of it as"  |
| 4   | Interactive widgets in articles    | **Shared components**: lessons' Try it keeps using them, blog articles embed them                               |
| 5   | Where the nav appears              | **Public pages only** (the marketing `TopBar`); the dashboard bar is unchanged                                  |
| 6   | About us and Support               | Visible links to a simple "Coming soon" page each; `noindex`, not in the sitemap                                |
| 7   | Learn panel Library tab + drawer   | **Both removed**; the Blog replaces them                                                                        |
| 8   | SEO                                | **A second step** (sitemap, per-article meta, maybe prerendering); the first PR ships routes and `SeoHead` only |

## 3. What exists today (so we know what moves)

- `learn/articles.ts` (934 lines): 9 articles (`suncoin`, `bitcoin-network`, `exchange-price`, `price-swings`,
  `spot-a-scam`, `mailboxes-keys`, `money-101`, `bitcoin-story`, `getting-bitcoin`), each a list of blocks (headings
  with ids, text, widgets).
- `learn/ArticleWidgets.tsx`: the interactive pieces (SunCoin notebook, node jobs, order book, block chain, swing sizer,
  scam check …). Some are lessons' Try it screens (`lesson.tryWidget`, e.g. Lesson 2's `block-chain`).
- `learn/concepts.ts` and `graph.ts`: the concept spine. Each concept has a peek **and an `article`**; `graph.ts` works
  out the links lesson ↔ concept ↔ article both ways. `learn/terms.ts` parses `[[term]]`.
- `learn/ArticleDrawer.tsx` + `articleStore.ts` (in memory only): the right-hand article drawer, mounted by
  `DashboardPage`, opened from a term peek's Read more, a card's `more`, the summary's article links, or the Learn
  panel's `LibraryTab` (a tab of `PathDrawer`).
- `guide/lessons.ts`: 14 `more: { article }` and 23 `article:` references (cards, recap points, can-do lines).
  `LessonSheet.tsx` imports the article store, articles, widgets and graph.
- Public pages (`LandingPage`, `FeaturesPage`) render `<TopBar marketing />`; legal and auth pages use `LegalLayout` and
  `AuthLayout` (logo and footer, no nav). The dashboard uses `<TopBar />`.
- The site is a client-rendered app on Cloudflare Pages: no prerender today.

## 4. Target

### 4.1 The Blog

- `apps/client/src/blog/` (new): `posts.ts` (the 9 articles' content, moved from `learn/articles.ts`: slug, title,
  summary, blocks; no lesson or concept fields), `BlogIndexPage` (`/blog`: a list of cards: title, summary, reading
  time) and `BlogPostPage` (`/blog/:slug`: the article, a back link, "More articles"). Lazy routes in `App.tsx`; an
  unknown slug goes back to `/blog`.
- **Shared widgets:** `learn/ArticleWidgets.tsx` moves to `components/widgets/` (name `InteractiveWidgets`), exporting
  the same components; `LessonSheet` (Try it) and `BlogPostPage` both import from there. `WidgetId` moves with it.
- Reading time stays (`articleMinutes`), moved to `blog/`.
- Both pages use `SeoHead` (title, description, canonical); `noIndex` nothing. The sitemap and robots entries wait for
  the SEO step.

### 4.2 The nav (visual Q&A first, `design.md`)

- A `SiteNav` component rendered by the **marketing `TopBar`** only: **Product ▾** (a dropdown: Chart, Features),
  **Blog**, **About us**, **Support**, to the right of the logo and BETA badge; the account controls stay at the right.
- Tokens only (`lib/tokens.ts`); the dropdown follows the app's menu pattern: keyboard (Enter/Space opens, arrows move,
  Esc closes), `aria-expanded`, focus ring, no hover-only access.
- Phones (below `sm`): the links collapse into one menu button (a sheet), as the top bar already drops its wordmark there.
- `/about` and `/support`: one small `ComingSoonPage` (title, a short note, a way home), `noindex`.
- The dashboard `TopBar` is untouched.

### 4.3 Lessons without articles

- Remove every `more: { article }`, every `article` / `section` on recap points and can-do lines, and the
  "Read more" button. The summary's lines become plain lines.
- Keep `[[term]]` peeks: `concepts.ts` drops its `article` field (and `TourId` links stay); `graph.ts` keeps
  concept ↔ lesson and ↔ tour, drops article edges; the peek loses its Read more. `earlierPlace` (a term an earlier
  lesson taught) stays.
- `LessonSheet`: no article store, no `readMore`, no `ArticleDrawer` origin ("Back to Lesson 1").
- Try it widgets stay lesson-owned in effect (same components, now from `components/widgets`).

### 4.4 Removed

`ArticleDrawer.tsx` (+ css, test), `articleStore.ts`, `LibraryTab.tsx`, the Library tab in `PathDrawer`, the drawer
mount in `DashboardPage`, the article and library anchors in `lib/guideAnchors.ts`, the `learn/articles.ts` file (its
content now in `blog/posts.ts`), and their tests.

## 5. Phases and PRs

| PR  | Scope                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Move content and widgets; `/blog` and `/blog/:slug`; the marketing nav and the two placeholder pages; unlink the lessons; remove the drawer and Library tab; tests and docs |
| 2   | SEO: sitemap entries, per-article structured data and meta, robots, decide on prerendering (a build-tooling and supply-chain review if added)                               |
| 3+  | About us and Support content; blog categories or dated posts; a standalone rewrite of the articles (see §7)                                                                 |

PR 1 is one feature PR to `develop` (one testable unit per commit inside it): (a) widgets move, (b) blog content and
pages, (c) nav and placeholders, (d) lessons unlinked, (e) drawer and Library removed, (f) docs.

## 6. Tests and docs

- New: `BlogIndexPage` / `BlogPostPage` (renders every post, unknown slug redirects, widgets mount), `SiteNav`
  (dropdown open/close, keyboard, phone menu, links), `ComingSoonPage`, a lessons rule that no card, recap or can-do
  line carries an article, and a rule that every concept has a peek and no article.
- Changed or deleted: `ArticleDrawer`, `LibraryTab`, `PathDrawer` (no Library tab), `LessonSheet` (no Read more, no
  origin), `learnGraph`, `terms`, `lessons`, `articleMinutes`, `ArticleWidgets` (moved).
- E2E: add a smoke for `/blog` and the nav on the landing page; the guide anchors for the nav use `guide()`.
- Docs: `APP_LOG.md` (the move, the nav, what was removed), `UI_REPRODUCTIONS.md` (the Library steps go, the nav steps
  come), `TRADING_TEST_PLAN.md` if a case ID is cited, the `lesson-authoring` skill (§ "Linking terms to articles":
  peeks only, no `more`, no article ids), `add-page` skill checklist (new routes), `SEO_READINESS.md` (the Blog, to
  come in PR 2).

## 7. Risks and open points

- **The articles are written to accompany lessons** ("Your turn", Nora's notebook, "back in Lesson 1"). Moved as they
  are they may read oddly on their own; a standalone editing pass is PR 3+ (owner to confirm the wording rules then).
- **A tapped term now ends at a definition**, so a beginner who wants depth finds nothing in the lesson: the Blog is
  reached from the public nav only (a lesson never links to it, by decision).
- **Old state:** `articleStore` is in memory only, so no persisted migration; nothing on the server references
  articles (`LEARN_ITEM_IDS` has none).
- **SEO is deferred**: until PR 2 the blog is crawlable only as a client-rendered app.
- **Slugs are public URLs**: pick them once (`/blog/what-is-bitcoin`-style, kebab-case, no dates) and don't rename
  without a redirect.
- Widget code moves between folders: a mechanical but wide diff; do it first, alone, so it reviews cleanly.

## 8. Verification

`pnpm type-check`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm case-coverage --strict`; by hand at 375, 412,
820 and 1440 px: the nav (dropdown by mouse and keyboard, the phone menu), `/blog` and one article with a widget, a
lesson with a tapped term (peek, no Read more), the Learn panel (no Library tab), no sideways scroll. After the
release, the prod smoke covers `/blog`.
