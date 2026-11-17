---
name: lesson-authoring
description: "Use when writing or rewriting a guided lesson (cards, quizzes, the 'Your call' moment, Try it) for cryptopapertrade.com's learning path, benchmarked against a reference course (its screenshots and the comparison files live in the git-ignored guided-learning-topics/). Covers: same concepts and a similar length, never paraphrased text; the beginner tone; quiz formats (multiple choice, drag and drop, choose buy or sell, match boxes); practice paper trades from a card and the look at what just happened; the one label set (Continue, Back, Finish lesson); Try again until right; the math breakdown and the analogy (a guide in glasses); pictures on top; linking terms to articles; the technical-writer fact check; illustrations; the learning path's order; lessons.ts rules, tests and docs. Trigger words: write a lesson, new card, rewrite Lesson N, match the benchmark, compare lessons, lesson quiz, drag and drop, buy or sell quiz, match boxes, lesson coverage, fact check a lesson, lesson illustration, path order, new unit, practice trade, paper trade from the lesson, try it on the chart, do the math, percent, analogy, glasses, try again, button label."
---

# Lesson authoring — cryptopapertrade.com

How to write our guided lessons so they teach at least everything a benchmark course teaches, at a
similar length and with the same kinds of interaction, while every word, example and picture stays
ours. Owner decisions, 2026-11-14: same topics + similar length; quiz formats multiple choice, drag
and drop, choose buy or sell and match boxes; a missing quiz widget is built after the visual Q&A;
the owner's Table 2 instructions come first.

## Hard rule: benchmark, never copy (IP)

The benchmark course is a **coverage and format benchmark**, not a source text.

- **The repository is public** (since 2026-09-29): name the benchmark course only in the
  git-ignored `guided-learning-topics/`. In tracked files (code, comments, tests, docs, skills,
  rules, commit messages, PRs) say "the benchmark course". The working tree carries no mention of
  it (cleaned 2026-11-16); keep it that way. **Enforced** by `scripts/denylist-check.sh`:
  - the pre-commit hook rejects a staged added line or new file name (during a merge, only the
    resolution: what the merged-in side brings is public already or checked at push);
  - the commit-msg hook blocks a commit message early (it skips comment lines, so git's editor
    template never blocks a clean message, and warns when a skipped line names a term);
  - the pre-push hook is the authority: it rejects any outgoing commit whose stored message,
    added lines or new file names name
    it, so a cherry-pick, a rebase or `git am` (no other hook runs) is caught before it's public;
  - **Local only:** a clone without the list, `--no-verify`, GitHub's web editor and a squash-merge
    subject skip these checks, and so does a checkout where git runs no hooks (husky not set up,
    or a relative `core.hooksPath` seen from a linked worktree, which has no `.husky/_`). A server-side check in CI (the terms in an Actions secret) would
    cover them; that's the owner's call, not built (owner 2026-11-16: git checks only).
  - **Not checked:** what `gh` publishes (PR titles and bodies, comments, reviews, merge subjects,
    issues). Shell commands can't be parsed reliably enough to prove what `gh` would send (owner
    2026-11-16: git checks only). Write that text by this rule: say "the benchmark course", write
    it to a file first and re-read it before passing `--body-file <path>`.

  The list: the git-ignored `guided-learning-topics/notes/denylist.txt`, one term a line, matched
  case-insensitively as a substring (list distinctive names, never short or common words); `#`
  comments allowed; case-insensitive for ASCII letters. Removing a mention, editing a file whose
  name already holds one, or deleting it is always allowed. If git fails, the check blocks. A worktree uses
  the main checkout's list; with no list, every check warns on stderr and passes. Text drawn
  inside an image can't be read. Keep the list up to date. Git history can't be cleaned this way: a few older
  commit messages and merged PR titles still name it. Renaming those PR titles is the owner's call.

- **Match:** the concepts and learning goals each lesson covers; roughly the number of screens; the
  quiz formats (generic interaction types).
- **Never match:** the benchmark's wording, card by card paraphrase, their examples (the companies, people,
  numbers and stories they use), their screen order inside a lesson, their images or layouts. A
  reworded benchmark card is still a close paraphrase of their course: copyright covers expression and
  the selection and arrangement of content, not only exact words.
- **How to write a card:** start from the concept and our own sources (the knowledge-base articles in
  `apps/client/src/learn/articles.ts`, the owner's notes in `guided-learning-topics/`, primary
  sources), then write it in our voice with our own example. Never draft a card with the benchmark cell
  open beside you as the thing being rewritten; use table 1 only to tick off concepts.
- **Never paste** text from the comparison file's benchmark column into code, docs, tests, commit
  messages or PRs. Refer to it by row number only ("row 1.07").
- **Any other reference** (a book, another course, an article): the same rule. Techniques and
  facts only, never its text, pictures or characters.
- If the owner's instruction for a row amounts to "use their text" or "same example", say so,
  explain the risk in one line, and propose our own example instead. Don't implement a paraphrase.

## Inputs

1. The comparison file for the lessons, `guided-learning-topics/notes/10-…-vs-cpt-lessons-1-3.md`
   (git-ignored):
   - **Table 1** — the benchmark's screens and our cards side by side, per lesson, numbered rows (1.01 …).
   - **Table 2** — the merged plan: one row per topic, with the owner's **take / drop / rewrite**
     instruction. **This drives the work.** Rows with an empty instruction are not started: list them
     and ask.
2. The tone: the beginner tone in "Writing the cards" below (owner 2026-11-16).
3. The lessons: `apps/client/src/guide/lessons.ts`. Ids in code: `lesson-01` (Lesson 1),
   `lesson-ownership` (Lesson 2), `lesson-02` (Lesson 3).

## Benchmark screenshots: where they live (owner 2026-11-14)

The owner adds the benchmark's coming lessons as screenshots under `guided-learning-topics/`
(git-ignored), one numbered folder per **unit**, one numbered sub-folder per **lesson**:

```
guided-learning-topics/
  01-<unit-slug>/                       ← unit 1 (exists)
    01-lesson01/   02-lesson02/   03-lesson03/
  02-<unit-slug>/                       ← unit 2, the unit's own name in kebab case
    01-lesson04/   02-lesson05/ …       ← lesson folders keep the course-wide lesson number
```

- Number folders with two digits (`01-`, `02-` …), in the benchmark's order. The unit slug is the
  unit's name in kebab case; the lesson folder is `NN-lessonMM` (NN = position in the unit, MM = the
  course-wide lesson number).
- Screenshots sort by filename into screen order (the macOS `Screenshot <date> at <time>.png` names
  do this). Don't rename them.
- When a new lesson folder appears, the first step is its comparison, before any writing: a new
  file in `guided-learning-topics/notes/`, next to the Lessons 1–3 comparison (number 10), with
  the next free number in `notes/` (e.g. 12 for Lesson 4; 11 is the makeover plan). Comparisons and
  plans live in `notes/` so their numbers never mix with the unit folders' numbers. The file has
  the same two tables. Table 1 has the benchmark's screens (transcribed for the owner's reference
  only) beside our nearest content. Table 2 has the topics, with the owner's instruction column left
  empty. Then wait for the owner's Table 2 instructions.
- Flag anything in a folder that isn't the benchmark (one of our own screenshots, a duplicate) rather
  than transcribing it as theirs.
- Screenshots and transcriptions stay in `guided-learning-topics/`: never commit them, copy them into
  the app or `docs/`, or quote them in code, tests, commits or PRs (the IP rule above).

## Workflow (per lesson)

1. **Read Table 2 for the lesson.** Build a coverage checklist: every concept the owner marked
   _take_ (from either column), every concept marked _drop_ (and why, if given). Ask about rows
   with no instruction before writing anything.
2. **Plan the screens** and get the owner's OK on a short outline before drafting any text. **Outline
   first** (owner 2026-11-16): save it as a numbered file in the git-ignored
   `guided-learning-topics/notes/` (e.g. `12-lesson-1-outline.md`) with:
   - the screen list: cards, the "Your call" moment, Try it, the quizzes (they can sit between
     cards, not only at the end), the summary, the close;
   - for each quiz, its format (see below) and what it checks;
   - the screen count next to the benchmark's for that lesson;
   - which concepts each screen covers (every _take_ concept appears at least once).
   - the practice trades offered: each card whose concept is a buy, sell, long or short, and the
     tour it starts (see "Practise it for real" below).
   - **Length vs the current caps.** `lessons.test.ts` allows at most six teaching cards of at most
     80 words, two or three questions, at most two `[[terms]]` a card. A benchmark-length lesson
     (~23–25 screens) doesn't fit. **Lessons 1–3:** the owner chose to raise the caps (2026-11-16) to
     about 16 teaching cards and up to 6 quizzes. **Not done yet:** `lessons.test.ts` still allows 6
     teaching cards and 3 checks; raising them, with the decision and date in the test, is the
     makeover's first platform step.
     **Later lessons:** don't silently go past the caps: offer the owner the choice for that lesson
     — raise them, or split the topic into two lessons. A new lesson id must be added everywhere
     that checks it, in the same change: `LESSON_IDS` (client), the path (`learn/path.ts`), the
     server's `LEARN_LESSON_IDS` (with `LEARN_TOUR_IDS` it builds `LEARN_EVENT_ITEM_IDS`, which the
     events route checks) and `LEARN_ITEM_IDS` (which the progress route checks), both in
     `apps/server/src/constants.ts`, the SDK's `LEARN_ITEM_IDS` / `LearnItemId`
     (`generated/CDSDK/types/index.ts`), the assertions in `apps/server/src/__tests__/learn.test.ts`
     and the SDK contract fixtures. A lesson id the server doesn't know gets a 400 on every event and
     progress write, so its rings never sync and it's missing from the funnel.
   - the pictures each screen uses (see "Illustrations").
3. **Draft the text** in the outline's order, in our voice (rules below).
4. **Fact check by a technical-writer agent** (owner 2026-11-14), on every freshly written screen,
   before the owner sees the draft. See "Fact check" below. Apply its corrections, then show the
   owner the draft (a short markdown table: screen, text, quiz, links), with the agent's findings and
   what changed, and wait for OK.
5. **Visual Q&A** for anything that changes how a screen looks (a new quiz widget, a new art or
   illustration, a new card layout): run it per `.claude/rules/design.md` before building
   (`session-bootstrap` non-negotiable #2).
6. **Implement** in `lessons.ts` (and new widgets), then tests and docs (below).
   **Progress on a rewritten lesson** (owner 2026-11-16): every learner's progress on it is reset,
   part-way through and completed alike; its `stepBase` moves; the lesson id stays.
7. **Coverage check before the PR:** go down the step-1 checklist; every _take_ concept is ticked
   with the screen that teaches it. Report any gap.

## Fact check (technical-writer agent)

After drafting and before the owner sees anything, spawn one subagent (the Agent tool,
`general-purpose`) as a **technical writer and fact checker**. Give it the drafted screens (text,
quizzes with options and Whys, linked terms) and ask it to:

- verify every factual claim: dates, names, numbers, definitions, how a mechanism works (mining,
  keys, order books, fees, leverage, liquidation …) against primary or reputable sources (protocol
  docs, the Bitcoin white paper, exchange documentation, regulators), citing each source;
- check each quiz: exactly one right answer, the Why really explains it, no option that is also
  defensible;
- check consistency with our knowledge-base articles (`apps/client/src/learn/articles.ts`) and the
  earlier lessons: same terms, same numbers;
- flag oversimplifications that would mislead a beginner, and unclear wording;
- report findings as a list (screen, claim, verdict, correction, source). It must not edit files,
  and must not use the benchmark's content as a source.

Apply the corrections that hold up (verify a disputed one yourself rather than taking either side on
trust), and list in the report to the owner which were applied and which declined, and why.

## Illustrations

- **Picture on top, text below** (owner 2026-11-17): a card's drawing, chart or photo always comes
  first, its text under it. `LessonSheet` lays every card out that way, and a `LessonSheet` test
  checks every card of every lesson.
- **Let the picture carry the text** (owner 2026-11-17): when a picture makes sense, choose or draw
  it so the learner understands most of the card by looking at it (the chart with its dated markers,
  the worked sum, the queue running thin). A picture that only decorates isn't enough.
- First reuse what we have: `LessonArt` drawings (`LessonArtId` in `lessons.ts`), the guides, real
  photos with a stated `credit`, charts from real market history.
- When a screen needs an illustration we don't have (owner 2026-11-14), take it from a **free
  third-party illustration library** instead of drawing one from scratch:
  1. Pick candidates and **read each licence at the time of use**: it must allow commercial use in an
     app, and modification (recolouring). Prefer licences with no attribution (CC0 or the library's
     own free licence). If attribution is required, the credit line must be shown, the way `photo`
     credits are.
  2. Prefer copying the individual SVG files into the repo (e.g. `apps/client/src/assets/illustrations/<library>/`)
     over an npm package. A package is a new dependency and goes through the supply-chain rules in
     `.claude/rules/security.md` (and `.npmrc`'s `only-built-dependencies` if it runs install
     scripts).
  3. Ask the owner before adding a new library: the candidates, the licence terms, a sample on our
     dark theme. Adding one is a visual decision (visual Q&A) and a sourcing decision.
  4. Recolour to our tokens (`lib/tokens.ts`); keep a consistent style within a lesson.
  5. Record each library once (name, URL, licence, date checked) in `docs/APP_LOG.md` and in a
     `README` beside the files, and each asset's source in a code comment where it's used.
- Never use the benchmark's illustrations, or trace or redraw them.

## The learning path (owner 2026-11-14)

- **What's approved (owner, 2026-11-14):** until the owner has placed our practical lessons (the
  dumbbell, done on the chart), the path follows the topic order the owner set; the detail is in
  the git-ignored `guided-learning-topics/notes/` (the makeover plan). The owner will decide later
  where the practical lessons go.
- **The risk, named:** the hard rule above says the _selection and arrangement_ of content can be
  protected. The topic order is the part of that the owner accepted. Everything else stays ours:
  unit and lesson titles, unit descriptions, every lesson's content, its order inside the lesson,
  its examples, and the path's look. Placing our practical lessons makes the sequence ours too.
  Ask the owner first before matching anything beyond the topic order (names, descriptions,
  badges or labels).
- **In tracked files** (the path code, APP_LOG, this skill), describe it as "the topic order",
  without naming the benchmark course or saying how closely it's followed.
- **Titles are ours:** write each unit and lesson title fresh from what our lesson actually teaches,
  in our voice. Don't take the benchmark's title and rephrase it: a reworded title is still their
  title. The same goes for unit descriptions and any path labels. Example (owner 2026-11-16): unit 1
  is "Start here: crypto and trading basics" (it replaced "Foundations of crypto", too close to the
  benchmark's unit name); Lesson 1 is "Up, down and your first trade".
- **Look stays ours:** the zig-zag path, the progress rings, the dumbbell and our colours (the
  owner's earlier decision: our own design identity). Matching the order doesn't mean matching their
  visuals.
- A lesson the benchmark has and we haven't written yet appears as a locked, "coming soon" stop with
  our own title, so the order is visible before the content exists. Confirm with the owner before
  adding placeholders.

## Writing the cards (our voice)

**The tone: written for beginners** (owner 2026-11-16). It applies to every lesson written or
rewritten, and to quizzes, Whys, summaries and titles.

- **Simple English.** Short sentences, everyday words, one idea at a time. Assume the reader has
  never traded and isn't a native speaker. Explain a term the first time it appears.
- **Fun and friendly.** Warm, a little playful, like a patient friend explaining over coffee. A smile
  on most cards, never at the learner's expense, never sarcastic.
- **Analogies welcome.** Tie a new idea to something familiar: "Think of it as …". Keep the analogy
  short, and say where it stops matching when that matters (an analogy must never teach something
  wrong; the fact check reviews them too).
- **Encouraging.** Mistakes are part of learning: a "Not quite." is followed by a kind, clear Why.
- **No jargon walls, no hype, no fear.** Excitement comes from understanding, not from promises of
  profit.
- **Where jokes stay out:** never in a warning or a recap, never about losses or money won, never
  at the learner. A worried card is serious all the way through.
- **Easy to translate:** no idioms a translation app would mangle; at most one exclamation mark a
  card.

- Two guides present: Pulin (`tick`, asks the questions a beginner is too polite to ask) and Berwyn
  (`tock`, answers them, usually). A card has `text` (may hold `[[terms]]`), or `lines` (a short
  exchange), or `beats` (a cold open), plus a `presenter` or a real `photo` (with its `credit`).
- Short: one idea per card.
- **One label set** (owner 2026-11-17): the main button always says **Continue**, the back link
  **← Back**, and the summary's button (the last screen that teaches) **Finish lesson**, in every
  lesson (`LESSON_LABELS` in `lessons.ts`). A card has no label of its own (no `nextLabel`: the lesson
  rules test refuses one), so no question-style labels.
- **A new, harder idea gets an analogy** (owner 2026-11-17), told by **one** guide wearing glasses
  (`analogy: { who, text }`), in place of the guides' chit-chat on that card: "Think of it as …".
  Say where it stops matching (Lesson 1's short: borrow a game, sell it, buy one back cheaper, return
  it, keep the difference; "our perpetual borrows nothing"). It counts toward the card's 80 words.
- **Do the math** (owner 2026-11-17): a card that works out a gain, a loss or a percent shows the
  sum (`math: { who, steps, answer }`). A guide in glasses says "Let's do the math", then numbered
  steps, one operation each with its result, then the answer set apart:

  ```
  1. Price rise           73,079 − 27,500 = 45,579
  2. Divide by the start  45,579 ÷ 27,500 = 1.657
  3. As a percent         1.657 × 100 = 165.7%
  ➜ Bitcoin rose about 166%.
  ```

  - Every figure comes from the card's own data (the dated candles beside it, noted in a code
    comment), recomputed when written; the same numbers on every card that uses them.
  - 2–6 steps, a short label, one operation (`a − b = c`, `≈` when rounded); the lesson rules test
    checks the shape. The sums don't count toward the 80 words.
  - Our numbers only, never an example from the benchmark course or an owner's illustration of the
    format.

- **The glasses** (owner 2026-11-17): either guide may wear them (`GuideFigure glasses`: thin round
  frames in the face's line colour), per card, for the math and for an analogy; Pulin and Berwyn take
  turns.
- Plain words, then the term: say what it does before its name.
- Our own examples: Nora and her notebook, SunCoin, Emi, the pizzas, our charts from real market
  history (`ChartScene`, BTCUSDT daily candles). Invent fresh ones rather than borrowing a
  benchmark's.
- No hype, no price predictions; the honest answer is the praised one in "Your call"; paper trading
  only, no real money.
- A worried mood only for a real warning (the lesson rules test checks it).

## Quiz formats

| Format             | Use for                                                     | Status                                             |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------- |
| Multiple choice    | a fact or a judgement with one best answer, and a Why       | exists: `LessonQuestion` (`checks`, `moment`)      |
| Choose buy or sell | read a situation or a chart, pick Buy or Sell, then the Why | designed 2026-11-16 (visual Q&A done); being built |
| Drag and drop      | put steps in order, or items into the right slot            | new widget                                         |
| Match boxes        | connect terms to meanings, two columns                      | new widget                                         |

- Every quiz shows **Right.** or **Not quite.** then the Why, never repeating the pick (owner
  2026-11-13); the chosen option is already marked.
- **Try again until right** (owner 2026-11-17), on every lesson question (Match boxes, Drag and
  drop, Choose buy or sell, multiple choice, Your call): after "Not quite." and the Why, a **Try
  again** button (`lesson.retry`) clears the answer and empties the board; Continue shows only once
  the answer is right. Back off a wrong answer clears it too. Checkpoints keep their scored, one-go
  answers.
- Every quiz has a Why that teaches, not only "correct".
- A buy-or-sell quiz never rewards guessing a price direction: the right answer follows from a stated
  plan or rule in the situation (the same honesty rule as "Your call").
- **Quizzes can sit between cards** (owner 2026-11-16), not only at the end: the Lesson 1 outline
  puts them mid-lesson.
- **Decided designs, reused without a new visual Q&A (owner 2026-11-16):**
  - **Drag and drop:** numbered empty slots on top, cards below. Drag a card into a slot, or tap a
    card then tap a slot (keyboard: Tab to a card, Enter to pick, Tab to a slot, Enter to place).
    "Check" grades: each slot turns green with ✓ or red with ✕, then "Right." / "Not quite." and the
    Why, and after a "Not quite." Try again (2026-11-17).
  - **Match boxes:** two columns, terms on the left, meanings on the right (shuffled). Tap a term, then
    its meaning: the pair gets the same numbered chip (①②③), so colour is never the only cue; tap a
    paired box to undo. "Check" marks each pair ✓ / ✕, then "Right." / "Not quite." and the Why.
    Phones keep the two columns.
  - **Streak screen** (after the close): a flame with today's streak counting up ("3-day streak"), this
    week's 7 days as dots (done days filled amber), one line ("Come back tomorrow to keep it going"),
    and Continue. The Learn panel's counter updates at the same time. Reduced motion: no count-up.
  - **Practice trades on phones and tablets:** guided too. The arrow points at the phone's Buy / Long
    and Sell / Short bar, then the order sheet; after the trade the lesson reopens on the next screen.
- **Building a new format** (owner: build it, after the visual Q&A):
  1. Visual Q&A first: layout on phone and laptop, how a drop or a match is shown, keyboard and
     screen-reader use (drag and drop needs a non-drag path: tap to pick, tap to place).
  2. Add a typed shape next to `LessonQuestion` in `lessons.ts` (e.g. a discriminated `kind`), so
     `lessonScreens` and `LessonSheet` render it; keep it pure data.
  3. A component under `apps/client/src/guide/` with a CSS Module, tokens from `lib/tokens.ts`, guide
     anchors via `guide()` registered in `lib/guideAnchors.ts`.
  4. Tests: the component (right, not quite, keyboard path, reduced motion) and the lesson rules.

### Choose buy or sell: the decided design (visual Q&A, owner 2026-11-16)

Later lessons reuse this design as it is; no new visual Q&A unless it changes.

- **Layout** (phone first; the laptop sheet is the same, wider): the real chart on top with the
  plan's price line; the plan in a short line under it ("Your plan: … Today it closed at …"); then
  Buy and Sell side by side.
- **Buttons** filled like the phone trade bar (`MobileTradeBar`): Buy green (`color.green`, dark
  `bg.page` text), Sell red (`color.red`), each with an arrow and the word (never colour alone).
- **After the answer:** a tick or cross on the picked button, "Right." / "Not quite." and the Why,
  which points at the plan, never at the price. Then the chart reveals the next days (a scene with
  `freezeAt`), captioned "What happened next (the plan doesn't depend on it)".
- **Access:** two real buttons in tab order with the focus ring; arrow keys move between them;
  screen readers hear the chart's label, the plan, then Buy / Sell; the result is announced
  (`role="status"`); reduced motion skips the reveal animation.

## Practise it for real: a paper trade from the lesson (owner 2026-11-16)

When a benchmark row teaches a trade action, our lesson lets the learner do it, on the real chart,
with paper money, and then picks up where it left off.

### When to offer one

- The trigger is the **concept**, not the benchmark's example: a card that teaches buying, selling,
  going long, going short, or closing a position. The example on the card stays ours (the IP rule).
- One practice trade per concept, at most; not on every card that mentions a price.
- List the offers in the outline (Workflow step 2) so the owner sees them before any build.

### What the learner sees

1. On that card, an offer under the text: a main button such as "Try it on the chart" and a
   "Skip" beside it. Skip simply moves to the next screen.
2. The lesson sheet steps aside (it hides, as it does for a lesson's Try it today).
3. A guided tour, the arrow ring and bubble, walks them through the paper trade: the right market
   (Spot for buy/sell; **USDT Perpetual for long/short**, since shorting needs it), Market or Limit,
   the amount, then Buy or Sell. A long/short tour also shows how to close the position.
4. **What just happened** (owner 2026-11-17, every practice trade): once the order fills, the tour
   stays on the chart and shows the result in the account panel ("Orders & Account" on a phone),
   highlighting what matters for that action: the coin bought (Assets tab, its row, Unrealized PnL),
   the open long or short (Positions tab, its row: side, entry, Unrealized P&L, the ✕ that closes it).
5. At the end (or on Skip / ✕ in the tour) a clear way back, "Back to the lesson", which
   **resumes the lesson on the screen after the card**, not at the start, with the answers and
   progress kept (`lessonStore` in memory, the furthest screen synced to the account).

### How it works (built 2026-11-16)

- **A card offers one** with `practice: { tour, label }` (`lessons.ts`, a `PracticeTourId`): the
  sheet shows the label as a button under the card's text. A card field, so `lessonScreens`, the
  funnel's step ids and `stepBase` don't move.
- **The practice tours** are in `apps/client/src/guide/tours.ts` (`PRACTICE_TOURS`,
  `PRACTICE_TOUR_IDS`): `practice-buy` (spot, `/dashboard/spot/BTC/USDT`), `practice-long` and
  `practice-short` (USDT Perpetual, `/dashboard/usdt/BTCUSDT`). Each opens the form, picks Market,
  USDT and $100, and places the order. Its `next` is its **review** (`PRACTICE_REVIEWS`,
  `PRACTICE_REVIEW_IDS`: `review-buy`, `review-long`, `review-short`), a short chapter on the account
  panel with existing anchors (`account.tab`, `assets.row`, `assets.row.upnl`, `positions.row`) whose
  last step's button says "Back to the lesson"; the review has no `next`, so the chain ends back in
  the lesson. A chain keeps each chapter to five steps. A new practice tour gets its entry there,
  built with the `practice()` helper (with its review) and the shared step builders (`steps.ts`).
- **Handing over and resuming:** `startTour` (`afterNote.ts`) treats a card's practice tour as the
  lesson's own (`own()`), so the lesson waits. `LessonSheet` resumes when **no tour runs any
  more** (a chain such as `buy-first-coin → sell-and-review` included), and `lessonStore.leaveTour()`
  moves on from the Try screen or from the card that offered the practice.
- **Phones (owner 2026-11-16):** a step may be `screen: 'phone'` or `'desktop'`; `tourStore` reads the
  width (`WIDE_LAYOUT_QUERY` in `lib/breakpoints.ts`, lg; `useTourWide` in components) when a tour starts and runs only those steps (`tourSteps`). A
  phone-ready tour (`phoneReady: true`) opens the form from `MobileTradeBar` (`trade.mobile.buy` /
  `trade.mobile.sell`); a lesson's Try and the close's way on are then offered on phones too. The
  primer's hover steps need a pointer, so it isn't phone-ready.

### Rules

- Optional, never required: Skip is always there, and a skipped practice never blocks finishing.
- Paper money only, and the offer says so ("practice money, nothing real").
- No profit promises, no price predictions: the tour teaches the steps, not a winning trade.
- Small: a fixed small amount ($100).
- A step whose anchor can't be found fails gracefully: its `missingHint` says what to open (on a phone,
  to close the panel hiding the bottom bar), and closing the tour returns to the lesson on the next
  screen, never a dead end.
- **Not saved or reported on its own** (`useTourProgress` skips ids that aren't `isTourId`): the
  lesson's own screens report the funnel and count the learning day, and practice tours stay out of
  the server's tour lists and the `all-tours` badge.

### Tests when adding one

- `tours.test.ts`: at most five steps on each screen size, registered anchors, phone and desktop
  first steps, `next` = its review, and the review's steps (which tab, which row).
- `LessonSheet.test.tsx`: the practice button hands over and the lesson resumes one screen on; a
  chain keeps the lesson waiting.
- `lessons.test.ts`: the cards that offer a practice, and which tour.
- The steps in `docs/UI_REPRODUCTIONS.md`.

## Linking terms to articles

- Markup: `**bold**`, `*italic*` and `[[term]]` render through one renderer (`RichText`). Never put a
  `[[term]]` inside `*…*` (its asterisks would show), and write sums with `×`, never `*` (the
  run between two `*` would turn italic). The tests catch a nested term (any `*` left on screen)
  and a `*` with spaces around it or flush between digits; other uses of `*` are on you.

- A term in card text links with `[[label|concept-id]]` (or `[[concept-id]]`): it opens a peek, and
  the peek opens its article. Concept ids must exist in `apps/client/src/learn/graph.ts`
  (`conceptFor`); `terms.test` checks it. At most two terms a card.
- A card that goes deeper gets `more: { article, section? }` (a Read more). Article ids are
  `ARTICLE_IDS` in `apps/client/src/learn/articles.ts`; `section` is an `h` block's id.
- **Only link to what exists.** If a term deserves an article that doesn't exist yet, don't invent an
  id: list it in the report as a proposed article (title, what it would explain).
- A term an earlier lesson taught says "Lesson N" where it's reused (lesson rules test).

## Tests and docs to update (same PR)

- `apps/client/src/guide/__tests__/lessons.test.ts` — the lesson rules (caps, structure, the
  lesson's own expectations); `LessonSheet.test.tsx` for new screen kinds.
- `apps/client/src/learn/__tests__/terms.test.ts`, `articleMinutes.test.ts` if articles change.
- `stepBase`: when a lesson's screens change, raise it by at least the SDK's `LESSON_VERSION_SPAN`
  (40: one version's steps, which the server refuses past; a lesson's screens must fit in it), so
  stored steps and rows are never read as today's.
  Record the replaced version's last step in `lessons.test`'s `EARLIER_LAST_STEPS`, and raise the
  SDK's `LESSON_FIRST_STEPS` and the server's `LESSON_FIRST_STEP` with it (a test on each side holds
  them together; the server refuses and ignores anything below). **Mind the ceiling:** the server
  accepts a step number of up to three digits (`stepId` pattern `{1,3}`, `MAX_STEP` 999 in
  `apps/server/src/routes/learn/index.ts`), so `stepBase` + the lesson's screens must stay at 999 or
  below.
- `minutes` (e.g. `LESSON_01_MINUTES`) to the new length.
- Docs: a dated `docs/APP_LOG.md` entry; `docs/UI_REPRODUCTIONS.md` steps for the lesson;
  `docs/TRADING_TEST_PLAN.md` rows if a scenario changes (memory: keep test docs in step on release).
- Phone screenshots of the changed screens to the owner before the PR (the screenshot scripts in the
  past sessions were throwaway Playwright scripts; write a fresh one). On the **local dev
  database only**:
  1. register a throwaway account through `localhost:5173/register` (any `@example.com` address),
     with a password you note;
  2. mark it verified, so `ProtectedRoute` lets it into the dashboard and lessons (signing in
     works without it): in the dev database, set its `"emailVerifiedAt"` to now
     (the dev server doesn't send the email);
  3. the script signs in through `/login`, opens the lesson with
     `useLessonStore.getState().start(id, screen)` (imported from the page's `lessonStore` module),
     and captures each screen at 390 px and 1280 px.

## Report back (per lesson)

- The coverage checklist with each concept's screen, and any concept dropped (with the owner's row).
- Screen count: ours vs the benchmark's.
- Quizzes by format, and any new widget built.
- Practice trades offered: the card, the concept (buy, sell, long, short, close) and the tour.
- Terms linked (concept → article) and proposed new articles.
- Any Table 2 instruction declined under the IP rule, and the alternative offered.
