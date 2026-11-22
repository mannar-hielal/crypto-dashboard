---
name: lesson-authoring
description: "Use when writing or rewriting a guided lesson (cards, quizzes, the 'Your call' moment, Try it) for cryptopapertrade.com's learning path, benchmarked against a reference course (its screenshots and the comparison files live in the git-ignored guided-learning-topics/). Covers: same concepts and a similar length, never paraphrased text; the beginner tone; quiz formats (multiple choice, drag and drop, choose buy or sell, match boxes); practice paper trades from a card and the look at what just happened; the one label set (Continue, Back, Finish lesson); Try again until right; the math breakdown and the analogy (a guide in glasses); pictures on top; linking terms to articles; the technical-writer fact check; illustrations; the learning path's order; lessons.ts rules, tests and docs. Trigger words: write a lesson, new card, rewrite Lesson N, match the benchmark, compare lessons, lesson quiz, drag and drop, buy or sell quiz, match boxes, lesson coverage, fact check a lesson, lesson illustration, path order, new unit, practice trade, paper trade from the lesson, try it on the chart, do the math, percent, analogy, glasses, try again, button label, draw a line, chart practice, freehand, trash button, bull, bear, human characters, the friends."
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
- **How to write a card:** start from the concept and our own sources (the Blog's articles in
  `apps/client/src/blog/posts.ts`, the owner's notes in `guided-learning-topics/`, primary
  sources), then write it in our voice with our own example. Never draft a card with the benchmark cell
  open beside you as the thing being rewritten; use table 1 only to tick off concepts.
- **Never paste** text from the comparison file's benchmark column into code, docs, tests, commit
  messages or PRs. Refer to it by row number only ("row 1.07").
- **Any other reference** (a book, another course, an article): the same rule. Techniques and
  facts only, never its text, pictures or characters.
- If the owner's instruction for a row amounts to "use their text" or "same example", say so,
  explain the risk in one line, and propose our own example instead. Don't implement a paraphrase.

## Inputs

1. The comparison file for the lesson or checkpoint being written, in the git-ignored
   `guided-learning-topics/notes/` (made per "Benchmark screenshots" below). Chapter 1 is finished
   (2026-11-18) and its notes were cleared, so each new chapter starts from an empty `notes/`:
   - **Table 1** — the benchmark's screens and our cards side by side, numbered rows (N.01 …).
   - **Table 2** — the topics, one row each, with the owner's **take / drop / rewrite**
     instruction. **This drives the work.** Rows with an empty instruction are not started: list them
     and ask.
2. The tone: the beginner tone in "Writing the cards" below (owner 2026-11-16).
3. The lessons: `apps/client/src/guide/lessons.ts`. Ids in code: `lesson-01` (Lesson 1),
   `lesson-ownership` (Lesson 2), `lesson-02` (Lesson 3), `lesson-04` (Lesson 4), `lesson-coins` (Lesson 5,
   chapter 2's first lesson), `lesson-stablecoins` (Lesson 6), `lesson-wallets` (Lesson 7), `lesson-fees` (Lesson 8; the chapter's later lessons follow as numbered 9 onward). The chapter's
   checkpoint is `learn/checkpoints.ts` (`checkpoint-ch1`: ten questions, pass at eight, version 3):
   a new chapter gets its own, with its question-set version in `CHECKPOINT_VERSIONS` (SDK) and
   `CHECKPOINT_VERSION` (server).

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
  file in `guided-learning-topics/notes/` with the next free number (numbers start at 10 and
  count up across chapters). Comparisons and plans live in `notes/` so their numbers never mix with the unit folders' numbers. The file has
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
   - **Length vs the current caps.** `lessons.test.ts` allows at most 16 teaching cards of at most
     80 words, up to six questions (at most three of them `checks`; Lesson 7 asks eight, owner 2026-11-22, a named exception in the lesson rules test), at most two `[[terms]]` a card
     (raised by the owner, 2026-11-16, to fit a benchmark-length lesson of ~23–25 screens).
     **Beyond that:** don't silently go past the caps: offer the owner the choice for that lesson
     — raise them, or split the topic into two lessons. A new lesson id must be added everywhere
     that checks it, in the same change: `LESSON_IDS` (client), the path (`learn/path.ts`), the
     server's `LEARN_LESSON_IDS` (with `LEARN_TOUR_IDS` it builds `LEARN_EVENT_ITEM_IDS`, which the
     events route checks) and `LEARN_ITEM_IDS` (which the progress route checks), both in
     `apps/server/src/constants.ts`, the SDK's `LEARN_ITEM_IDS` / `LearnItemId`
     (`generated/CDSDK/types/index.ts`), the assertions in `apps/server/src/__tests__/learn.test.ts`
     and the SDK contract fixtures. A lesson id the server doesn't know gets a 400 on every event and
     progress write, so its rings never sync and it's missing from the funnel.
   - the pictures each screen uses (see "Illustrations").
   - the sneak peek card and its 3 or 4 lines (see "The opening"), taken from the recap.
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
7. **Code review and a second fact check once the lesson is built** (owner 2026-11-19), before the
   coverage check and the PR:
   - **Code review:** run `/code-review high` on the lesson's changes: the working tree, or the
     lesson's commits against its base when they are already committed (never commit just to get a
     diff; commits wait for the owner's ask). It covers `lessons.ts`, new art or widgets, ids, tests,
     docs. Fix what holds up, and report what was declined and why.
   - **Fact check of the built text:** the step-4 check saw the draft; the text changes while it is
     built and edited. Run the technical-writer check again (see "Fact check") on the lesson as it
     now stands in `lessons.ts`, so the shipped cards, quiz options and Whys are what was checked.
   - Each fix gets its test where it can. Show the owner the findings and what changed with the
     built lesson (screenshots), then go on.
8. **Coverage check before the PR:** go down the step-1 checklist; every _take_ concept is ticked
   with the screen that teaches it. Report any gap. It comes last so that the fixes from step 7
   can't drop a concept unnoticed.

## Fact check (technical-writer agent)

It runs twice: on the draft (workflow step 4) and again on the built text (step 7). After drafting
and before the owner sees anything, spawn one subagent (the Agent tool,
`general-purpose`) as a **technical writer and fact checker**. Give it the drafted screens (text,
quizzes with options and Whys, linked terms) and ask it to:

- verify every factual claim: dates, names, numbers, definitions, how a mechanism works (mining,
  keys, order books, fees, leverage, liquidation …) against primary or reputable sources (protocol
  docs, the Bitcoin white paper, exchange documentation, regulators), citing each source;
- check each quiz: exactly one right answer, the Why really explains it, no option that is also
  defensible;
- check consistency with the Blog's articles (`apps/client/src/blog/posts.ts`) and the
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
- **Show the real thing, not a stand-in** (owner 2026-11-20): when a card demonstrates a coin, a token, an
  exchange or any other known symbol, use as close a match to its real logo or symbol as we may use, never
  just a plain circle with its ticker text. The learner should recognise it from the picture. The logo's
  licence and trademark terms are read at the time of use, and the source is recorded, like any other
  third-party art (steps 1–5 below). Where no logo may be used, say so to the owner and propose the closest
  honest option, rather than falling back silently to circles and text.
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

### Human characters: a fresh pair (owner 2026-11-18)

Where the benchmark shows a **human pair** on a card (e.g. two people with opposite money styles
for a trading-versus-investing comparison), our lesson uses **our own human pair**, not Pulin and
Berwyn. Everywhere else the guides stay.

- **Two female friends**, in the same teaching roles as the benchmark's pair: one calm, long-term
  **investor** (relaxed pose, glasses), one active, tech-using **trader** (laptop, on the move).
  The owner asked for the same _look types_; keep to the type only, and make everything else ours:
  different faces, hair, clothes, colours, poses and props. Never trace or redraw the benchmark's
  characters (see "Hard rule: benchmark, never copy").
- **The pair (owner approved 2026-11-18):** every lesson reuses the same two people (same names,
  roles and look):
  - **Lena**, 38, a nurse: the calm, long-term **investor** (glasses, relaxed pose).
  - **Zoe**, 34, an app designer: the active **trader** (laptop, on the move).
  - They were flatmates at university.
- **Art:** **Open Peeps** (Pablo Stanley, CC0: "Free for commercial and personal use under CC0
  License", recolouring invited; checked on openpeeps.com 2026-11-18), chosen by the owner
  2026-11-18; the files are in `apps/client/src/assets/illustrations/open-peeps/` (`lena.svg` is
  peep-38, `zoe.svg` peep-67) with a README that records the licence and the palette. A card that
  needs the pair uses the art ids `friends`, `lena`, `zoe`. A new person follows the same steps:
  sample on our dark theme for the owner's visual Q&A, then the five steps above.
- **People are coloured like people** (owner 2026-11-18: the first version, white line art with
  purple skin on a purple card, looked wrong). When an illustrated person is recoloured:
  - **Natural, believable colours**: a real **skin tone** for the face and hands (warm brown, peach,
    tan, deep brown: vary it across a lesson's people), natural **hair** (dark brown, black), and
    **clothes** in soft, friendly colours. **Never** skin in a UI colour (purple, green, grey) and
    never white line art on a dark fill.
  - **Dark ink** (a deep warm plum or brown such as `#3a2c3f`, not pure black) for outlines, hair and
    a dark jumper; the same ink on every person of a pair.
  - **A light disc behind each figure** (their accent mixed with white: `color-mix(in srgb,
<token> 22–28%, white)`), so the natural colours read on our dark panels. Each friend keeps
    their accent: Lena green, Zoe amber.
  - **Recolour by role, not by swapping black and white.** The library's skin, clothes and hands are
    often one shape; split what you can (the head's fill is the skin, a second sub-path is a prop
    like a mug), and paint the hands skin by drawing the clothes shape again, clipped to a small
    ellipse over each hand.
  - The art file carries its own palette (an illustration, not UI: `design.md`'s no-hex rule is for
    components); list every colour and its role in the README beside the files.
  - Show the owner the result on the real card (a screenshot) before the PR, as with any picture.
- **Bull and bear roles:** when a card needs the two market moods, **Pulin plays the bull** (the
  optimist) and **Berwyn the bear** (the cautious one). The spelling is "Berwyn" (owner
  2026-11-18). The human pair is for people's styles, not for the bull and the bear.

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
  (`tock`, answers them, usually). When a card needs the bull and the bear, Pulin is the bull and
  Berwyn the bear (owner 2026-11-18). A card has `text` (may hold `[[terms]]`), or `lines` (a short
  exchange, never card 1: see "The opening"), or `beats` (a cold open), or `preview` (the sneak peek),
  plus a `presenter` or a real `photo` (with its `credit`).
- **A chat between Pulin and Berwyn doesn't name them every time** (owner 2026-11-19). Each guide
  already shows as a speaker (face and side), so don't open every line with "Pulin:" or "Berwyn:",
  and don't write "Pulin asks…" in the text. Say a name only when it helps: the first time a card
  introduces one, or when the text talks about them. The sheet shows a chat line with the avatar
  alone (no bold name; the name stays as screen-reader text), owner 2026-11-20.
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

## The opening: a sneak peek, not a chat (owner 2026-11-22)

A lesson never opens with the guides' back-and-forth. Their chat told the learner little; what the
learner wants first is **what they will know by the end**. So every lesson has one **sneak peek** card
near the start, drawn from the lesson's own closing recap.

- **The card:** `title: 'What you will learn'` (the same on every lesson, like the one label set),
  its **own graphic** on top, then `preview: [...]`: **3 or 4 short numbered lines** (at most 16
  words each), rendered in the summary's style (purple numbers). It counts toward the 80-word cap.
  - **The graphic is derived from the lesson's topics, never borrowed** (owner 2026-11-22: a road
    scene or the friends, drawn for another card, said little at this moment). It is a numbered path
    through the same 3 or 4 topics as the lines below, one icon and a two-line label each
    (`PeekMap` in `LessonArt.tsx`, one `peek…` art id per lesson, e.g. `peekCoins`), the same
    template every time so every opening looks alike. A new lesson adds its own `peek…` id (type,
    `ART`, `ART_LABELS`, the art test), with labels of at most 10 characters a line (13 for three
    stops) and the stops in the order of the lines.
  - **A guide points at it:** Pulin or Berwyn stands in the picture with `pose: 'point'` (alternate
    them from lesson to lesson). They only point; there is no chat and no text from them.
- **Where it goes:**
  - A lesson whose opening would be a chat: the peek **is card 1** and takes its picture (Lessons
    5, 6 and 7).
  - A lesson that opens with a strong hook (a photo, a headline, a counter, a text card): keep the
    hook as card 1 and put the peek as **card 2** (Lessons 2, 3 and 4).
  - Lesson 1's "Meet your guides" card already lists what you will learn, so it is its peek: no
    second card.
- **What goes in it:** each line is a topic in the plain words of the matching recap point, put
  forward ("How to keep a recovery phrase safe"), never an answer ("Write it on paper") and never a
  new fact: the promise and the summary must match. Write the recap first, then the peek from it, and
  re-read both whenever one changes. A line that names a number or a claim goes through the fact check
  like any card.
- **The first card never repeats the peek** (owner 2026-11-22): a cold open, a hook or an opening
  text card does not announce what the lesson will teach ("In the next 9 minutes: …", "Today you
  will see …"). The peek, right after it, says it once. A hook ends on its own question or fact.
- **The guides still appear** on the analogies, the math, the quizzes and the teaching cards. The
  chat card (`lines`) stays a tool for a mid-lesson exchange where two voices help; it is never card 1.
- **A peek added to a released lesson moves its screens:** raise `stepBase` by the SDK's
  `LESSON_VERSION_SPAN` (40), record the replaced version in `EARLIER_LAST_STEPS`, raise the SDK's
  `LESSON_FIRST_STEPS` and the server's `LESSON_FIRST_STEP`, shift `momentAfter` by one, and ship a
  data migration that clears every learner's progress on the lesson (see "Tests and docs"). A lesson
  not yet released only changes its card.
- **Tests:** `lessons.test.ts` ("should open with a sneak peek, never the guides' chat") holds the
  rule for every lesson (its own `peek…` graphic, a pointing guide, no announcement in a cold open);
  `LessonSheet.test.tsx` checks the card renders as a graphic with a pointing guide and a numbered
  list; `LessonArt.test.tsx` checks each graphic's stops.
- **Outline:** list the peek's lines in the outline (Workflow step 2), next to the recap.

## Quiz formats

| Format              | Use for                                                     | Status                                                     |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Multiple choice     | a fact or a judgement with one best answer, and a Why       | exists: `LessonQuestion` (`checks`, `moment`)              |
| Choose buy or sell  | read a situation or a chart, pick Buy or Sell, then the Why | built: `BuySellView` (`format: 'buy-sell'`)                |
| Drag and drop       | put steps in order, or items into the right slot            | built 2026-11-16: `OrderQuiz` (`format: 'order'`, `steps`) |
| Match boxes         | connect terms to meanings, two columns                      | built 2026-11-16: `MatchQuiz` (`format: 'match'`, `pairs`) |
| Draw a line         | trace a path, trend or level with one freehand line         | built 2026-11-18: `DrawQuiz` (`format: 'draw'`)            |
| Pick the right ones | choose exactly N of 6 icon tiles                            | built 2026-11-18: `PickQuiz` (`format: 'pick'`)            |

- Every quiz shows **Right.** or **Not quite.** then the Why, never repeating the pick (owner
  2026-11-13); the chosen option is already marked.
- **Try again until right** (owner 2026-11-17), on every lesson question (Match boxes, Drag and
  drop, Choose buy or sell, multiple choice, Your call): after "Not quite." and the Why, a **Try
  again** button (`lesson.retry`) clears the answer and empties the board; Continue shows only once
  the answer is right. Back off a wrong answer clears it too. Checkpoints keep their scored, one-go
  answers.
- **After three "Not quite." the right answer is shown** (owner 2026-11-18), on every lesson question
  (all formats, the draw card and Your call included): the third wrong check doesn't offer another
  Try again. It marks the right answer for the learner (the right option, the right order or pairs,
  the right tiles, Buy or Sell, the answer path drawn on the chart in green: see "Draw a line"), keeps the Why, and unlocks
  Continue, so nobody is stuck. The three count per visit to that card (Try again keeps the count;
  going Back and returning starts it again), and the lesson counts a revealed answer as
  answered: it keeps no per-question score (an answer only gates Continue), so a revealed answer and
  a right one look alike, and coming back to the card shows a plain "Right.". Checkpoints stay scored and one-go, with no reveal.
  - **Say so kindly:** "That's three tries. Here is the answer." then the Why. Never "you failed".
  - **Status (2026-11-18):** built for the draw card only (`DrawQuiz`: `MAX_MISSES`, `AnswerResult`'s
    `revealed`). The other boards (`QuestionView`, `OrderQuiz`, `MatchQuiz`, `BuySellView`,
    `PickQuiz`) still offer Try again without end; give each its reveal the same way (its own right
    answer marked, the Why, no Try again) when the owner asks.
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

### Draw a line: the decided design (owner 2026-11-18)

Whenever a lesson step asks the learner to **draw** (trace a trade's path from buy to sell, a trend,
a level), it is a draw-a-line card. Don't turn it into a multiple-choice question about the chart.

- **One freehand line per card**, drawn over our own chart (`ChartScene`, real BTCUSDT history, dated
  candles). A **trash button clears the whole line** so the learner can redraw; there is no
  per-stroke undo.
- **Graded against an expected path** (owner 2026-11-18). The card's data holds the expected path
  (e.g. the buy candle, the sell candle and the direction between) and a tolerance. Check turns on
  once there is a line at least 40 px across. A line that fits gets "Right." and the answer drawn
  with theirs; one that doesn't gets "Not quite.", a kind Why, and **Try again** (the line is
  cleared), as for every quiz above.
- **After the third "Not quite." show the answer on the chart** (owner 2026-11-18, from a
  screenshot where the answer was a faint dotted line nobody could see). The answer is **the line
  they should have drawn**, and it must be unmissable:
  - a **solid green line** (`color.green`, 4 px) through the dated closes from the buy to the sell,
    over a dark halo (`bg.page`, 9 px) so it stays clear of the candles; **never dotted or thin**;
  - a **dot and a label on the Buy and on the Sell** (the card's `draw.buy.label` / `draw.sell.label`);
  - the learner's own line **stays but steps back** (35% opacity), so the answer reads first;
  - the message starts "That's three tries. Here's the answer." and the Why opens with "The green
    line is the path to draw."; no more Try again, Continue unlocks.
  - A right answer shows the same green line beside theirs, and a revisit shows it alone ("The
    path, in green:").
- **"Stuck? Use a hint"** link under the chart: the hint names where the path starts and ends
  (the dated candles), never the shape to copy.
- Every figure and date comes from the card's own candles (noted in a code comment), recomputed
  when written. Our own title and wording: never the benchmark's.
- The card follows the same rules as the other quizzes: picture on top, text below, the one label
  set, at most 80 words.
- **Access:** pointer events (mouse, touch and pen); a keyboard / screen-reader way to place the
  start and end points; reduced motion skips any animation. The exact fallback is settled in the
  visual Q&A.
- **Status:** built 2026-11-18 (`guide/DrawQuiz.tsx`, `drawGrade.ts`; Lesson 4's "Trace a trade").
  A card sets `format: 'draw'`, a `chart` with no markers, and `draw: { buy, sell, hint }` (each a
  dated close); `options: []`, `correct: 0`. The visual Q&A is done, so later lessons reuse it as
  it is. The keyboard way (arrow keys and Enter for the buy and the sell) is built in.

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
  more** (a chain such as `buy-first-coin → review-first-coin` included), and `lessonStore.leaveTour()`
  moves on from the Try screen or from the card that offered the practice.
- **Phones (owner 2026-11-16):** a step may be `screen: 'phone'` or `'desktop'`; `tourStore` reads the
  width (`WIDE_LAYOUT_QUERY` in `lib/breakpoints.ts`, lg; `useTourWide` in components) when a tour starts and runs only those steps (`tourSteps`). A
  phone-ready tour (`phoneReady: true`) opens the form from `MobileTradeBar` (`trade.mobile.buy` /
  `trade.mobile.sell`); a lesson's Try and the close's way on are then offered on phones too. The
  primer's hover steps need a pointer, so it isn't phone-ready.

### Every practical lesson ends with a walkthrough (owner 2026-11-17)

- **One job per practical lesson.** A map stop with the dumbbell does one trade action: the Buy lesson
  buys, the Sell lesson sells. No `next` hands one practical lesson over to another: each is its own
  map stop, started from the map. A lesson that needs another one first says so on the map
  (`NEEDS_DONE` in `learn/path.ts`: Sell stays locked until Buy is done), and its first step that
  depends on it says what to do instead in its `missingHint` (Sell with no Bitcoin: "do “Buy your
  first coin” on the learning map first").
- **Then what just happened.** Every practical lesson, and every card's practice trade, ends with a
  walkthrough of what the trade changed in Order & Account Management ("Orders & Account" on a
  phone). It points at the important rows and columns for that action, by the panel's own column
  labels, e.g.:
  - after a buy: Assets, the coin's row, Avg cost, Unrealized PnL;
  - after a sell: Assets (the coin gone, USDT back), Order History (Side, Type, Qty, Fill Price,
    Status, Commission), the account summary's Realized P&L, Balance History (Balance Before,
    Balance After, Realized P&L, Action);
  - after going long or short: Positions, Side, Avg Fill Price, Unrealized P&L, the ✕ (Close).
- **How:** the walkthrough is a review chapter the trade's tour chains to with `next`
  (`PRACTICE_REVIEWS` after a card's practice trade; `PATH_REVIEWS` after a map lesson:
  `review-first-coin`, `review-sell`, `review-sell-result`). Five steps at most per chapter: a longer
  walkthrough chains a second chapter, so the lesson stays one map stop. The same look in two places
  shares one source (`boughtSteps` builds both `review-buy` and `review-first-coin`); only the last
  button differs ("Back to the lesson" after a card, Finish on the map).
- Point at existing anchors (`account.tab`, `assets.row`, `order-history.row`, …). A row or figure
  with none gets a static `guide()` anchor registered in `lib/guideAnchors.ts` (no user data in it);
  a step with no key rings the first match, the newest row in a newest-first table.
- A lesson's tour is marked done (and counted) when its own steps end, at the order: the review
  chapters, like the practice tours, are neither saved nor reported.

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
  first steps, `next` = its review (never another practical lesson), and the review's steps (which
  tab, which row, the column labels its text names).
- `LessonSheet.test.tsx`: the practice button hands over and the lesson resumes one screen on; a
  chain keeps the lesson waiting.
- `lessons.test.ts`: the cards that offer a practice, and which tour.
- The steps in `docs/UI_REPRODUCTIONS.md`.

## Terms and peeks (no article links since 2026-11-18)

The articles moved to the public Blog (`/blog`, `apps/client/src/blog/posts.ts`) and **nothing in a
lesson links to them** (owner 2026-11-18): no `more`, no `article` or `section` on a recap point or a
can-do line, no "Read more" in a peek.

- Markup: `**bold**`, `*italic*` and `[[term]]` render through one renderer (`RichText`). Never put a
  `[[term]]` inside `*…*` (its asterisks would show), and write sums with `×`, never `*` (the
  run between two `*` would turn italic). The tests catch a nested term (any `*` left on screen)
  and a `*` with spaces around it or flush between digits; other uses of `*` are on you.
- A term in card text is `[[label|concept-id]]` (or `[[concept-id]]`): it opens a **peek**, a one-sentence
  definition and a "Think of it as…" line, and that is all. Concept ids must exist in
  `apps/client/src/learn/concepts.ts` (`conceptFor` in `graph.ts`); `terms.test` checks it. At most
  two terms a card.
- **A new idea that needs a peek** gets a concept (`id`, `term`, `peek`, `think`): no article field.
  If it also deserves an article, that is a Blog post, written separately and never linked from the
  lesson: list it in the report as a proposed post (title, what it would explain).
- A summary (`recap`) and a close (`canDo`) are plain lines (`{ text }`).
- A term an earlier lesson taught says "Lesson N" where it's reused (lesson rules test).

## Tests and docs to update (same PR)

- `apps/client/src/guide/__tests__/lessons.test.ts` — the lesson rules (caps, structure, the
  lesson's own expectations); `LessonSheet.test.tsx` for new screen kinds.
- `apps/client/src/learn/__tests__/terms.test.ts`, and `apps/client/src/blog/__tests__/` (`articleMinutes`, `posts`) if articles change.
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
- Terms marked (their concepts) and proposed new Blog posts.
- Any Table 2 instruction declined under the IP rule, and the alternative offered.

## Pick the right ones: the decided design (owner 2026-11-18)

A card that asks the learner to **choose several of a list** (traits, habits, signs) is a Pick card, not
a multiple-choice question with many answers.

- `format: 'pick'`, `tiles: [{ label, icon, right }]` (4–6 tiles, at least two right and one wrong;
  six lays out as 2 × 3), `options: []`, `correct: 0`. The question text names how many to pick.
- Each tile has a Phosphor duotone icon (`TileIcon` in `lessons.ts`; add a name and its icon in
  `PickQuiz.tsx` for a new one) and a few words. A tapped tile gets a purple outline; "Picked 2 of 3"
  counts; Check turns on at exactly the number right; a third pick is refused until one is unpicked.
- After Check each picked tile shows ✓ or ✕ (never colour alone), then "Right." / "Not quite." and the
  Why, then Try again, as for every quiz. Keyboard: Tab to a tile, Space toggles.
