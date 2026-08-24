# Story App — Product & Technical Spec

An AI-driven, choose-your-own-adventure story maker. The user picks a genre, the AI
writes a chapter, the user reads it like a book, then chooses one of 4 actions to
steer the plot. Repeat until the story reaches its ending. Runs entirely in the
browser; no backend.

---

## 1. Decisions locked

| Area | Decision |
|---|---|
| Stack | React + Vite + TypeScript, static build |
| Storage | Browser-local (localStorage + IndexedDB), no server |
| AI provider | OpenAI, user-supplied API key stored locally |
| Text model | `gpt-5.5` |
| Cover images | AI-generated (`gpt-image-2` at `medium`), lettered by the model |
| Generation UX | Single streaming call; prose renders as it arrives |
| Pagination | Measured reflow against the live container |
| iPad | Two-page spread in landscape, single page in portrait |
| Story length | Audience-driven: Children 10 chapters, Young Adults 20, Adults 30 |
| Chapter length | Audience-driven: ~250 / ~500 / ~800 words |
| Achievements | The AI decides when one is earned |
| Genre editing | Editable mid-story from the Read screen; affects future parts only |
| PDF export | Full book — cover, prose, achievement pages, achievement index |
| Visual design | Apple Books layout, iOS system palette and type scale, systemBlue tint |
| Icons | Phosphor Icons (regular), self-hosted WOFF2, hand-declared glyph subset |

---

## 1a. Visual design

Modelled on Apple Books, using the iOS system palette so the app looks native on the
devices it targets.

- **Fonts are system fonts, not webfonts.** `-apple-system` resolves to **SF Pro** and
  `ui-serif` to **New York** on Apple platforms — the faces Books itself uses. Neither
  can be licensed for web redistribution, so non-Apple platforms fall back through
  `system-ui` / Charter / Georgia.
- **Colour** is the iOS system palette as CSS custom properties: `systemBackground`
  white (pure black in dark mode), `label` / `secondaryLabel` / `tertiaryLabel`,
  hairline separators, and **systemBlue** (`#007AFF` / `#0A84FF`) as the tint. Books
  itself tints systemOrange, but blue is the platform default and reads as
  interactive rather than decorative. The tint is two tokens — `--tint` and
  `--tint-pressed` — so swapping to another system colour is a two-line change.
- **Type** follows the iOS scale — 34pt large title, 17pt body, 13pt captions — with
  SF Pro's negative tracking applied at body sizes.
- **Large titles collapse.** Library and Settings render their title at 34pt inside the
  scroll area; scrolling past it fades the compact title into the navigation bar and
  fades in the hairline, as UIKit does.
- **Icons: Phosphor, regular weight.** Ionicons is the closest match to iOS visually but
  dropped its webfont at v5 and ships SVG only. Phosphor is geometric with rounded
  terminals — the nearest available approximation of SF Symbols — is MIT licensed, and
  ships a real WOFF2. SF Symbols itself cannot be used: Apple licenses it for Apple
  platform apps only, not web redistribution.
  - The font is declared by hand in `src/icons.css` rather than by importing
    `@phosphor-icons/web/regular`. That import pulls 73 KB of CSS for ~1,500 icons and
    makes Vite emit every format the package ships — a 3 MB SVG font plus 489 KB TTF
    and WOFF. Only the WOFF2 and the twelve glyphs in use are declared, which is the
    difference between a 4 MB and a 147 KB font payload.
  - Adding an icon means copying its codepoint from the package's `style.css` and
    adding the name to `IconName` in `src/components/Icon.tsx`.

## 2. Core concepts and vocabulary

- **Story** — one book. Has a title, cover, genre triple, pages, achievements, summary.
- **Chapter** — one AI generation. Produces prose, 4 actions, an optional achievement,
  and a refreshed plot summary. A story is a fixed number of chapters. (Called "part"
  in the first draft of this spec and in schema v1; renamed throughout in v2.)
- **Page** — one screenful of rendered text. Pages are *derived* from chapter prose at
  render time, not stored as fixed units. An achievement page is a special page.
- **Action** — a one-sentence plot choice. Choosing one triggers the next part.

---

## 3. Data model

```ts
type Audience = 'Children' | 'Young Adults' | 'Adults';
type Genre =
  | 'Action' | 'Adventure' | 'Comedy' | 'Crime' | 'Drama'
  | 'Horror' | 'Mystery' | 'Romance' | 'Fairy Tale';
type Setting =
  | 'Western' | 'Space' | 'Fantasy' | 'Urban' | 'Nature' | 'Mythological'
  | 'Futuristic' | 'Medieval' | 'Prehistoric' | 'Historic';

interface Achievement {
  id: string;
  title: string;          // 2–3 words
  description: string;    // 1 sentence
  unlockedAtChapter: number;
}

type Chapter =
  | { kind: 'prose'; index: number; text: string; chosenAction?: string }
  | { kind: 'achievement'; index: number; achievementId: string };

interface Story {
  id: string;
  schemaVersion: 1;
  title: string;
  coverImageId: string | null;      // key into IndexedDB blob store
  audience: Audience;
  genre: Genre;
  setting: Setting;
  totalChapters: number;               // 10 | 20 | 30, fixed at creation
  chapters: Chapter[];
  achievements: Achievement[];
  pendingActions: string[];         // the 4 choices awaiting the reader; [] when finished
  summary: string;                  // rolling plot summary, ~500 words, AI-maintained
  status: 'draft' | 'reading' | 'finished';
  /** Resume anchor. A page number would break on rotate or font-size change. */
  readingPosition: { chapterIndex: number; wordOffset: number };
  /** Set when the genre triple changed mid-story, so the next prompt can bridge it. */
  genreChangedAtChapter?: number;
  createdAt: number;
  updatedAt: number;
}

interface Settings {
  apiKey: string | null;
  fontScale: number;                // 0.85 | 1 | 1.15 | 1.3
}
```

**Persistence split** — this matters:

- `localStorage['story-app:v1:stories']` — the full `Story[]` minus images. A 30-part
  adult book is ~24k words ≈ 150 KB of text. Ten of those is 1.5 MB, comfortably
  inside the ~5 MB localStorage quota.
- `localStorage['story-app:v1:settings']` — settings, including the API key.
- **IndexedDB** (`story-app-covers` store) — cover images as `Blob`s, keyed by
  `coverImageId`. Base64 covers must *not* go in localStorage: a single 1024×1536 PNG
  from the image API is 1–2 MB and would blow the quota after two or three books.
  Downscale each cover to 512×768 JPEG (quality 0.75, ~50 KB) via canvas before storing.
- Wrap every write in a `QuotaExceededError` handler that surfaces a real message
  ("Storage full — export and remove an older story") rather than failing silently.

---

## 4. Screens

Routing: hash routes (`#/library`, `#/settings`, `#/story/:id/genre`, `#/story/:id/read`,
`#/story/:id/actions`) so the device back gesture works and reloads restore position.

### 4.1 Library
- Title "Library", styled after iOS Books.
- 2-column grid of covers at 2:3 portrait. Below each: a chapter-progress caption
  ("Chapter 3 of 20", "30 chapters" before it starts, "20 chapters · Complete" when
  finished) and a "…" button opening a menu with **Export PDF** and **Remove**
  (Remove confirms first — it is irreversible and there is no cloud copy).
- **Titles are not shown in the grid.** The cover carries the book's identity, as in
  Apple Books' own grid. The title remains the cover button's accessible name and its
  pointer tooltip. Note the consequence: AI covers are prompted to contain no
  lettering (§6.6), so a story with a generated cover shows its title nowhere in the
  Library — only the placeholder cover renders it.
- First cell is **Create New**: a dashed-border tile with a "+" and the label.
- A gear icon in the nav bar opens **Settings**.
- The "…" menu is a bottom action sheet rather than an anchored popover: no
  positioning math, large touch targets, identical behaviour on phone and iPad.
- Remove asks for confirmation, then deletes the story *and* its cover blob. Deleting
  the record alone would orphan the image in IndexedDB.
- Tapping a story opens Read at `lastReadPage`.
- Empty state: only the Create New tile plus a one-line hint.


### 4.2 Genre
Two modes, same component:
- **Creation mode** (from Create New) — three labeled groups of pill buttons
  (Audience / Genre / Setting), single-select each, current selection highlighted.
  Instruction line at the top: *"Choose what kind of story you'd like. This shapes
  the whole book."* A **Confirm** button, disabled until all three are chosen.
  Defaults preselected (Children / Adventure / Fantasy) so Confirm is reachable fast.
  Pills are a `radiogroup`, not a row of toggles, so arrow keys move between options
  and the group is announced as one choice.
  Audience additionally sets `totalChapters` and part length — show that inline:
  *"Children — a short book, 10 chapters."*
- **Edit mode** (from the Read screen) — same pills, prefilled from the story.
  Audience is editable but does **not** change `totalChapters` on an in-progress story
  (that would strand the reader mid-arc); show a note saying so. Confirm button reads
  **Save**. Changes apply to future parts only, and the next generation prompt is told
  the story is deliberately shifting so the transition is written, not jarring.

### 4.3 Actions
- Title "Actions". Four full-width sentence buttons, generous tap targets, each a
  distinct way to push the plot.
- Tapping one navigates to Read and starts generating the next chapter, recording the
  sentence on the chapter it produced.
- **The choice travels in history state, not the store**, carrying the chapter count at
  the moment of choosing as a nonce. The reader acts on it only while the story still
  has exactly that many chapters, which makes the guard an invariant rather than a
  one-shot flag:
  - a request aborted for some other reason (leaving the screen, StrictMode's remount
    in development) leaves the count untouched and simply starts again;
  - once the chapter commits the count moves on, so a refresh, a back-forward, or the
    model happening to offer the same sentence twice can never re-fire it.
  A weaker guard — "is this choice still in `pendingActions`" — looks equivalent and is
  not: repeated action text sends it into a generation loop that spends real credit.
- On the final part there are no actions — the reader never reaches this screen; the
  book ends with a "The End" page instead.

### 4.4 Read
- Title "Read". Tap right third → next page, left third → previous page. Center tap
  toggles the nav chrome (so the reader can go fullscreen).
- Also support horizontal swipe, and Left/Right arrow keys for desktop testing.
- **Page-turn animation**: CSS 3D transform, `rotateY` on the outgoing page around its
  spine edge with `transform-style: preserve-3d`, plus a drop shadow along the hinge.
  380 ms. Respects `prefers-reduced-motion` with a cross-fade fallback.
  - **Page margins belong to the page, not to the stage.** The page element is the
    whole physical page — margins included — so the turning leaf carries them with it.
    With the margins on the stage instead, only the bare block of text rotated and the
    turn read as a floating rectangle.
  - The hinge is the **spine side**, which differs per column. Single page: left edge
    going forward, right edge going back. In a spread the spine is the inner edge, so
    the left page hinges on its right edge and the right page on its left, the way a
    real book opens. Rotation runs to 105°, past the point where the hidden backface
    takes the leaf out of view.
- Nav bar: **trophy icon** → Achievements modal; **book/tag icon** → Genre in edit mode.
  A page indicator (`12 / 47`) sits at the bottom.
- Reaching the last written page when choices are pending shows a "What happens next?"
  affordance, and **flipping forward past that page** opens the Actions screen — the
  spec's "after the user flips to the last page".
- **The affordance is an overlay, out of the layout flow, and that is load-bearing.**
  Rendered in the column it shortens the stage, which re-paginates the book, which
  changes which page is last, which hides the affordance, which restores the stage — an
  oscillation that leaves the final page unreachable and its last lines clipped. Any
  chrome that appears conditionally *based on* pagination must not be able to *change*
  pagination. A gradient scrim keeps the text under the button legible.
- While a part is generating, the newly arriving text is appended live; the reader can
  begin reading page 1 of the new part while the tail is still being written.

### 4.5 Achievements (modal)
- Title "Achievements", "X" to dismiss, scrollable list of unlocked achievements for
  *this* story, each showing title, description, and the part number.
- Empty state: "No achievements yet — keep making bold choices."

### 4.6 Achievement page
- A page inside the book, not a separate route. Centred: a trophy glyph, "Achievement
  Unlocked" as an eyebrow, the title in display type, and the description sentence
  beneath. Appears at the end of the chapter in which it was earned, and participates
  in page navigation and PDF export like any other page.
- Type is sized in `em` against the reader's own body size, so the **description is
  exactly the size and leading of the book's prose** and the whole page scales with
  the font-size setting rather than staying fixed while the prose grows around it.
- Vertical spacing is driven by the reader's line height (`--ach-rhythm`): a generous
  interval above the eyebrow and below the title, and a tight one between eyebrow and
  title, which read as a single unit.
- The page is a fixed-height box, so a pathologically long description would clip
  rather than reflow. At the largest font scale on a phone there is roughly 275px of
  headroom for a one-sentence description, which is what §6.4 asks the model for.

### 4.7 Settings *(new — the original spec had nowhere to enter a key)*
- OpenAI API key field (password-masked, with a "Test key" button that makes a cheap
  models-list call and reports success/failure).
- Reading font size control.
- "Clear all data" with a typed confirmation.
- A plain-language note: the key is stored in this browser's local storage and is sent
  only to `api.openai.com`. Anyone with access to this device/browser profile can read
  it. Recommend a dedicated key with a spend limit.
- If the user hits **Create New** with no key stored, route to Settings with an
  explanatory banner, then return them to creation.

### 4.8 Generating (state, not a route)
Inline in Read: a shimmer/quill animation with rotating status copy while the first
token is pending, then live text. Cancel button aborts the fetch and rolls back the
partial part.

---

## 5. Flows

**Create a story**
1. Library → Create New → (key check) → Genre (creation mode) → Confirm.
2. Create the `Story` record with `status: 'draft'`.
3. Fire the chapter-one generation and the naming/cover job **in parallel**; navigate
   straight to Read so the reader is never staring at a blank screen.
4. **The title is the waiting screen.** It arrives from its own short call a couple of
   seconds before the first prose token, so the reader sees "Thinking of a title…",
   then the book's name set large, then the prose begins under it. The name also
   replaces "Read" in the navigation bar for as long as chapter one is being written —
   the bar is fixed-height and outside the stage, so unlike a banner it cannot shrink
   the page and re-paginate mid-write.
   - **The title holds for a minimum of four seconds.** The gap between the title and
     the first token varies with how fast the model responds, and without a floor the
     moment can be over before it registers.
   - It is an **overlay** over the reader, not a sibling of it. The first page mounts
     and paginates underneath while the title is still showing, so when the hold ends
     the prose is already laid out and simply appears. Measured live: title at 2.1s,
     page ready at 4.2s, title cleared at 6.0s.
   - The hold only starts if the title arrives **before** any prose is on screen. A
     title that lands late must never cover a page the reader has begun reading.
4. Title comes from the part-1 response. Until it arrives, the library tile reads
   "Untitled Story".

**Read → choose → continue**
1. Reader pages to the end of the latest part.
2. "What happens next?" → Actions screen.
3. Tap an action → back to Read, generation starts, text streams in.
4. If the response includes an achievement, append an achievement page after the prose.
5. Repeat until `parts` reaches `totalChapters`.

**Ending**
- When generating parts `totalChapters - 1` and `totalChapters`, the prompt is told the story
  must converge and resolve. The final part's prompt forbids actions entirely and asks
  for a conclusive ending; the app appends a "The End" page and sets
  `status: 'finished'`.

---

## 6. AI integration

### 6.1 Transport
`POST https://api.openai.com/v1/chat/completions` with `stream: true`, `Authorization:
Bearer <key>`, called directly from the browser (OpenAI serves permissive CORS). Parse
the SSE stream manually with `fetch` + `ReadableStream` — do not pull in the SDK just
to set `dangerouslyAllowBrowser`.

Because these are reasoning models, time-to-first-token is dominated by reasoning.
Set reasoning effort to its lowest useful setting for this task so prose starts flowing
quickly; creative writing gains little from heavy reasoning here.

### 6.2 Streaming response format

You chose a single streamed call with incremental parsing. Implement it with a
**delimited format rather than raw JSON**, which gives the same behavior without the
fragility of partial-JSON parsing:

```
<prose text, plain paragraphs, streamed first>
===META===
{"title": "...", "actions": ["...","...","...","..."],
 "achievement": {"title":"...","description":"..."} | null,
 "summary": "..."}
```

- Everything before `===META===` is prose — appendable to the page buffer token by
  token with zero parsing. This is what makes text appear within a second or two.
- The metadata block arrives last and is parsed once, complete, with `JSON.parse`.
- `title` is only requested on part 1.
- If the stream ends before `===META===` — **or the metadata arrives malformed** —
  keep the prose, mark the chapter `metaMissing`, and offer a "Get the choices" retry
  that re-sends the prose and asks only for the JSON block. A truncated raw-JSON
  stream would have lost the whole chapter. Rejecting a chapter because its trailing
  JSON was bad would be the same failure by another route, so a `MetaFormatError` on
  a first pass is never fatal.
- Validate the parsed meta with a small runtime guard (exactly 4 non-empty actions;
  achievement either null or `{title, description}`) and retry once on violation.

### 6.3 Prompt inputs
Every generation sends:
1. Rolling plot summary (~500 words; the model rewrites it each chapter).
2. The last ~1000 words of prose verbatim, for voice and immediate continuity. Taken
   from the whole book, not the last chapter, so the window spans chapter boundaries.
3. Audience, genre, setting — plus a flag if they were just changed.
4. The full achievement list for this story (titles + descriptions), so it doesn't
   repeat one.
5. `chapterIndex` / `totalChapters`, and target word count for this audience.
6. The action the reader just chose (absent on part 1).
7. Pacing signal: `chaptersSinceLastAchievement`.

### 6.4 System prompt sketch

```
You are a novelist writing an interactive book, one chapter at a time.

AUDIENCE: {audience}   GENRE: {genre}   SETTING: {setting}
This is chapter {n} of {total}. Write approximately {wordTarget} words.
{if n >= total-1}: The book is nearly over. Begin converging the plot toward a
satisfying resolution.
{if n == total}: This is the FINAL chapter. Resolve every thread and end the story.
Do not offer any actions.

STYLE AND LANGUAGE: a per-audience block of concrete constraints, not adjectives.
"Simple sentences, warm tone" leaves the model to guess what simple means; a stated
reading age, an average sentence length, a rule for unfamiliar words and a paragraph
length do not.

- Children: written for a seven-year-old reading with an adult. Everyday vocabulary,
  unfamiliar words made plain by context rather than defined, one idea per sentence at
  roughly ten words, paragraphs of two to four sentences, no irony and no metaphor that
  needs unpacking, dialogue plainly attributed.
- Young Adults: written for a fourteen-year-old and never talked down to. Rich current
  vocabulary, deliberately varied sentence length, interiority that is legible without
  being announced, subtext welcome, real consequences, nothing explicit.
- Adults: unconstrained vocabulary and syntax, mature themes by implication rather than
  statement, ambiguity permitted.

Measured on live output for the same genre and setting, changing only the audience:
average sentence length 6.0 words (Children) against 10.5 (Young Adults), longest
sentence 12 against 43, and words of nine or more letters 1.4% against 3.5%. The
constraints demonstrably reach the prose.

Continuity: honor the summary and recent prose exactly. Never contradict established
facts, names, or the protagonist's voice.

After the prose, on its own line, output ===META=== followed by a single JSON object:
{ "actions": [4 distinct one-sentence choices, each a concrete action the protagonist
   could take next, meaningfully divergent from one another],
  "achievement": null, or {"title": 2-3 words, "description": one sentence} if the
   reader's last choice or this chapter earned a genuine milestone,
  "summary": the full plot so far in under 500 words, rewritten to include this
   chapter }
```

### 6.5 Achievements
The model decides, freely. Two guardrails keep it from firing every chapter or never
firing, without taking the decision away from it:

- The prompt carries `chaptersSinceLastAchievement` and asks for one **on average about
  once every 10 chapters**, stating explicitly that most chapters should return null.
- Client-side rejection below a hard floor of **6 chapters** since the last award. Set
  below the target so ordinary variance is allowed and only clustering is refused.

Both numbers live in `prompts.ts` as `ACHIEVEMENT_EVERY_CHAPTERS` and
`MIN_CHAPTERS_BETWEEN_ACHIEVEMENTS` — one definition each, because the instruction and
the guard must agree and two files is how they drift.

**The rate is uniform across audiences**, so chapter count decides the total: roughly
one achievement for a Children's book (10 chapters), two for Young Adults (20), three
for Adults (30). A Children's book may legitimately finish with none.

Expect real pacing variance here — it's the accepted cost of the model deciding. If it
turns out too noisy in practice, the client-gated variant is a small change.

### 6.6 Cover generation

**Covers are a persisted job, not a call.** Recording the *intent* is what makes healing
possible: a blob that never arrived leaves no trace, whereas a pending job can be
retried days later. `Story.coverJob` holds `attempts`, `nextAttemptAt`, `tier`,
`lastError` and a `leaseUntil`.

- **The model letters the cover itself.** The title and genre are part of the generated
  image, not drawn over it afterwards, so a cover cannot be made before the story has a
  title.
- **The story is therefore named before any prose exists.** A short non-streaming call
  invents a title from the genre triple at cover time, and the reconciler does it
  itself when `title` is empty. The title used to arrive with chapter one's metadata —
  which sits *after* the prose in the stream — so covers waited 20–60s for a chapter to
  finish, and a story whose first chapter never generated stayed untitled and coverless
  permanently. Naming up front decouples the two: the cover is drawn in parallel with
  chapter one rather than after it.
- The name is stored the moment it is generated, so a failed cover never pays to name
  the book twice, and chapter one only asks for a title if nothing has supplied one.
- **A reconciler singleton**, not a React effect. It must outlive component mounts: a
  loop tied to a screen would have its request aborted on every navigation, and by
  StrictMode's remount in development.
- **Eligibility** is derived, not stored: any titled story with no cover is pending,
  *even with no job record*. That is how stories created before covers existed heal —
  no migration data needed.
- **Backoff** 1min → 5min → 30min → 2h → 12h, then 12h indefinitely. Retries never stop;
  they just stop being frequent.
- **Prompt degradation.** A refusal is a problem with the prompt, not a transient fault,
  so it escalates the tier immediately rather than re-sending something already
  declined. Every tier keeps the lettering, since that is the point of the cover; what
  falls away is the imagery, which is what tends to trip the safety filter: tier 0 is a
  painted illustration, tier 1 a simple graphic design, tier 2 a plain typographic
  cover with no imagery at all.
- **Guards**: needs a key, needs `navigator.onLine`, one job at a time, a 4-second gap
  between jobs (the reconciler re-runs on every store change, and finishing a job
  changes the store — without pacing, twenty cover-less stories fire twenty requests
  back to back), and a `leaseUntil` so two open tabs do not generate the same cover.
  The gap is set when a job *starts real work*, never by a pass that found nothing to
  do: an idle tick that pushed the gap forward swallowed the kick from creating a story,
  leaving a new book unnamed until the next 60-second tick.
  A manual **Retry cover** bypasses the pacing gap; deferring a deliberate tap by
  several seconds reads as a dead button.
- Saving an API key clears every backoff, since a missing key is the most common reason
  covers are stuck and the reader should not wait out a 12-hour timer they just fixed.
- **Diagnosis is a first-class feature.** Settings → Covers has a **Diagnose covers**
  button that gives one definitive answer. It checks `GET /v1/models/<image model>`
  first — free, and it catches by far the commonest failure: the image model requires the
  OpenAI *organization* to be verified, which is separate from adding billing. Chat
  completions keep working while image generation 403s, so the symptom is "stories
  write but covers never appear". If access is fine it runs a real attempt, which
  produces a real cover, so a successful diagnosis is not wasted spend.
- The probe calls `attemptCover` directly rather than going through the scheduler. It
  cannot use `tick()`: the store notifies subscribers synchronously, so clearing a
  backoff fires a tick from inside `updateStory`, and the caller then awaits that
  already-settled no-op instead of the attempt it asked for — reporting "unknown
  reason" while the real error lands moments later.
- `window.coverDiagnostics()` prints the same state in any build, including production,
  since cover failures are invisible by nature and dev tooling is stripped from release.
- **A blocked reconciler must not look like a working one.** The pending shimmer runs
  only when generation is genuinely possible (`isCoverGenerating`); with no key or no
  connection the placeholder is static. An animation implying progress while nothing is
  happening is worse than no indicator. Settings carries a **Covers** section stating
  how many are waiting and why — missing key, offline, or the last error with automatic
  retry — which is where someone asking "why are there no covers?" will look.
- Requests `b64_json` rather than a URL: a returned image URL is short-lived and
  cross-origin, which would taint the canvas `normalizeCover` draws into.
One image call, prompted from title + audience + genre + setting,
explicitly asking for a book-cover composition with no text or lettering (models render
text badly; the title is drawn over it in the UI). Portrait 2:3. Downscale to 512×768
JPEG before storing. Failure leaves `coverImageId: null` and shows a neutral placeholder
tile with a **Retry cover** item in the "…" menu — a failed image must never block the
story.

### 6.7 Cost and errors
- Rough per-book scale: an adult book is 30 generations over a growing-but-capped
  context; children's books are a fraction of that. Verify current per-token pricing
  before quoting numbers to anyone — model pricing changes.
- Handled explicitly, each verified against a mocked stream: 401 (bad key → Settings),
  429 (distinguishing "rate limited" from "out of credit"), 5xx, network offline, user
  cancel, truncated stream, and malformed metadata.
- Every failure leaves the story in a consistent state — never a half-written chapter
  with no actions and no way forward.
- **A user cancel is not an error and not an incidental abort.** Generation state
  carries a distinct `cancelled` status, because auto-start is driven by state rather
  than a one-shot flag: an abort caused by leaving the screen (or by React StrictMode's
  remount in development) must restart, while a reader who pressed Cancel must not have
  it restarted for them.

### 6.8 Streaming into the reader

Streamed prose is appended to the story as a **provisional chapter** so it paginates
through the same path as committed text — the reader can start page one while the tail
is still arriving. Two details make that safe:

- The text fed to the measurer is **throttled to 500ms**. Measuring per token would
  re-paginate the book hundreds of times a chapter. Appending never moves earlier text,
  so a delayed measurement only ever grows the page count; boundaries the reader has
  already passed do not shift.
- The throttle is **bypassed the instant writing stops**, otherwise the provisional
  chapter lingers beside the committed one for a beat.
- Nothing is written to storage until the chapter completes. Committing per token would
  be thousands of localStorage writes, and a half-written chapter has no business
  surviving a reload.

---

## 7. Pagination engine

The implemented approach is simpler and more reliable than the binary-search-per-page
sketch this section originally carried.

**Each chapter is laid out once as a single continuous flow, and a page is a vertical
slice of that flow**, produced by translating it inside a clipping box. What was
measured is therefore exactly what is rendered — there is no re-flowing of a slice and
hoping the line breaks fall the same way.

For slicing to be safe the flow must sit on a **line grid**:

- Line height is an integer number of pixels (`round(fontSize × 1.6)`); fractional
  line heights accumulate rounding error down the page and drift off the grid. Body
  text is 21px at 100% scale, giving a 34px line.
- Paragraph spacing is exactly one line, so block boundaries stay on the grid.
- Page height is rounded *down* to a whole number of lines.
- **Chapter headings** ("Chapter 1", bold, 1.35em) open each prose chapter inside the
  flow. The heading's line box is exactly two lines and its margin exactly one, so the
  block is three whole lines tall and the grid survives it — its font size is then free
  to be anything that fits inside that box. Because the heading lives at the head of
  the flow it appears only on a chapter's first page, and it is measured and rendered
  by the same component, so the measurer cannot disagree with the page.
- Numbering counts prose chapters only, so an achievement interlude does not consume a
  chapter number.

With those three in place a slice boundary can never fall through the middle of a line.
Verified in-browser across all fixture chapters: every line box sits at a single
sub-line offset and zero lines straddle a page boundary.

- A hidden measurer holds every chapter's flow at the real column width, so page counts
  for the whole book come from one layout pass rather than one per chapter.
- Word ↔ page conversion uses `Range.getBoundingClientRect` with a binary search over
  word anchors — about ten rect reads per lookup, and it reads existing layout instead
  of forcing a new one.
- Recompute on viewport resize, orientation change, and font-scale change, via a
  `ResizeObserver` on the stage (which also catches iPad split-view and the iOS toolbar
  collapsing) plus an `orientationchange` listener.
- On every re-measure the visible page is **re-anchored from the stored word offset**,
  not carried over as a page index — the page index means something different after
  reflow, and keeping it silently moves the reader. Verified: rotating from phone
  portrait to iPad landscape re-opens on the same sentence.
- Cache the computed page breaks per (story, layout signature) so paging is instant on
  re-entry; invalidate when the signature changes.
- Achievement pages are inserted into the page sequence as fixed, unbreakable units.
- Landscape iPad: the column width is half the stage minus the gutter, and pages
  advance two at a time. The spread engages only when the stage is genuinely wide
  (≥820px and wider than tall), so a phone in landscape stays single-column.
- Prose is rendered with `*emphasis*` converted to italics. Language models emit
  markdown emphasis routinely even when asked for plain prose, and raw asterisks
  mid-page are a visible defect. This is the only markdown construct handled.

---

## 8. PDF export

Client-side with `jsPDF`, on **B-format paperback** (129×198mm) — the standard size for
a printed novel, and noticeably smaller in the hand than A5.

**Set in Literata**, embedded as a TrueType face rather than using one of jsPDF's
built-ins. It is *not* the reader's own font: on screen the app uses `ui-serif`, which
resolves to **New York** on Apple platforms — an Apple system font, which cannot be
redistributed inside a PDF and is not available as a file to embed. Literata is the
closest freely-licensed match (OFL): a book face designed for on-screen reading, with
similar proportions and colour.

- Fontsource ships WOFF2 only and jsPDF parses TTF only, so `npm run fonts` decompresses
  the Latin subsets back to TTF. WOFF2 is a compressed sfnt, so this is lossless. The
  output is checked in, and an ordinary build needs no font tooling.
- The Latin subsets are ~48KB per face rather than several hundred, and the three faces
  are separate assets fetched at export time — nothing pays for them until someone
  exports.
- If the faces cannot be fetched the exporter falls back to Times rather than failing
  the export.

1. Cover page: full-bleed cover image, cover-fitted so the overflowing axis runs off the
   edge. **The title is not overlaid**: the image model letters it into the artwork
   itself (§6.6), so drawing it again here would print it twice.
2. Title page, on a page of its own.
3. Body: prose reflowed to the PDF page size — its own pagination, unrelated to the
   reader's. Each chapter opens on a fresh page, as in the reader and in a printed book.
4. Achievement pages as centred inserts, in sequence.
5. "The End" when the story is finished, then an index of all achievements.
6. Page numbers on every page except the cover, which a printed book also leaves
   unnumbered.

- **jsPDF is imported dynamically.** It is ~390KB (129KB gzipped) and most sessions never
  export anything; loading it up front would make every cold start pay for an occasional
  feature. Its optional `html2canvas` and `dompurify` dependencies are dynamic imports
  inside jsPDF itself, so they are emitted as chunks but never fetched — nothing here
  calls `doc.html()`.
- Export is fast enough not to need a worker (~150ms for a three-chapter book), but a
  toast reports progress, since a long book plus image decoding is not instant.
- Export is disabled for a story with no chapters.

---

## 9. Project structure

```
src/
  main.tsx, App.tsx, routes.tsx
  main.tsx App.tsx types.ts styles.css
  screens/    Library Genre Actions Read Achievements Settings
  components/ NavBar Stub | BookGrid CoverTile PillGroup PageView PageTurn …
  ai/         client.ts streamParser.ts prompts.ts cover.ts
  storage/    keys.ts migrations.ts quota.ts stories.ts settings.ts
              covers.idb.ts useStories.ts
  pagination/ measure.ts paginate.ts usePagination.ts
  pdf/        exportStory.ts
  dev/        devtools.ts fixtures.ts selftest.ts
```

State: `storage/stories.ts` is the single source of truth, exposing
subscribe/getSnapshot for `useSyncExternalStore`. Screens bind through
`useStories()` / `useStory(id)`. No state library — the graph is small.

Everything under `dev/` is reached only through a dynamic import inside an
`import.meta.env.DEV` branch, so Rollup drops it (and the fixture prose) from
production builds. Verify with `grep -c "Lantern of Drowned" dist/assets/*.js`.

---

## 10. Build milestones

1. ~~**Scaffold**~~ — *done.* Vite 6 + React 19 + TS, hash routing, all 7 screen
   routes stubbed, storage layer with versioned envelopes and migration chain, quota
   handling, IndexedDB cover store with canvas downscale, three fixture stories,
   working Settings screen, and a 20-assertion storage smoke test at
   `window.__dev.selftest()`.
2. ~~**Library + Settings**~~ — *done.* Responsive cover grid (2 columns on phone,
   3–4 on iPad), genre-derived placeholder covers, bottom action sheet for the "…"
   menu, remove with confirmation that also deletes the cover blob, empty state,
   key entry with a live `GET /v1/models` test, and a no-key redirect from Create New.
3. ~~**Genre + creation**~~ — *done.* Pill selectors as accessible radiogroups, both
   modes, audience hint showing chapter count and chapter length, chapter count locked on
   started stories, mid-story shift warning that sets `genreChangedAtChapter`, and real
   story-record creation wired to Library → Create New.
4. ~~**Read + pagination**~~ — *done.* Line-grid pagination, tap zones, swipe, arrow
   keys, page-turn animation, iPad two-page spread, immersive mode, word-anchored
   resume that survives reflow, achievement pages in the page sequence, and inline
   emphasis rendering.
5. ~~**AI generation**~~ — *done.* Streaming SSE client, delimited parser, prompt
   assembly, achievement pacing guard, metadata repair, and every error path. Streamed
   prose paginates live via a throttled provisional chapter.
6. ~~**Choice loop**~~ — *done.* Actions screen, the choice hand-off, continuation,
   and the ending at `totalChapters` with a derived closing page.
7. ~~**Achievements**~~ — *done.* The modal sheet. Achievement pages landed with the
   reader (4) and the pacing guard with generation (5).
8. ~~**Covers**~~ — *done.* Image generation as a self-healing background job, prompt
   degradation, downscale, IndexedDB, placeholder and manual retry.
9. ~~**PDF export**~~ — *done.* B-format paperback (129×198mm) set in embedded
   Literata: cover page, title page, chapters, achievement inserts, closing page and
   achievement index, with jsPDF loaded on demand.
10. ~~**Polish**~~ — *done.* See §12.

---

## 10a. Platform constraints worth remembering

- **`crypto.randomUUID` needs a secure context.** It exists on HTTPS and on
  `localhost`, and is simply undefined over plain http on a LAN address — which is
  exactly how the app is opened when testing on a phone or iPad against the dev
  server. `newId()` therefore falls back to `crypto.getRandomValues`, which carries no
  such restriction. Anything else reached for from `window.crypto` needs the same
  check; `crypto.subtle` is likewise secure-context only.
- Related: the reader's own testing path is a LAN address, so any browser API gated on
  a secure context will fail there while working perfectly on `localhost`.

## 12. Polish notes

- **Theme colour follows the scheme.** Two `theme-color` metas, matched to `--bg` in
  light and dark, plus `color-scheme`. The single tag was still the cream from the
  pre-Apple-Books palette, so the iOS status bar disagreed with the page.
- **Zoom is not disabled.** `user-scalable=no, maximum-scale=1` was removed: pinch-zoom
  is an accessibility affordance, blocking it is hostile, and modern iOS ignores it
  anyway. The reader has its own text-size control on top.
- **No rubber-band in the reader.** The stage was `touch-action: pan-y`, which let iOS
  rubber-band a surface that never scrolls — the page appeared to peel away from the
  chrome on any vertical drag. Now `pinch-zoom`, which permits the accessibility gesture
  and nothing else, with `overscroll-behavior: contain` on every scrollable region so a
  scroll that reaches its end does not chain into the page behind it.
  `-webkit-touch-callout: none` stops a long-press on a tap zone offering to copy the
  paragraph.
- **Reduced motion turns pages instantly.** The global rule already collapsed the
  animation, but the reader still held the turn open for its full 380ms and ignored taps
  throughout — a third of a second of dead input with nothing on screen explaining it.
  The duration is now 0 under `prefers-reduced-motion`, committing the page immediately.
- **Failures are named, not generalised.** Storage-full and offline are reported as
  themselves rather than as "something went wrong" — telling someone to retry into a
  full disk or a dead connection just loops them.
- **An error boundary.** Without one a render error unmounts the tree and leaves a blank
  page, with the stories intact in storage but unreachable and nothing to indicate a
  problem. The fallback says the stories are safe, shows the message, and offers
  recovery. Note the ordering: it navigates *before* clearing the error, because
  clearing first re-renders the route that just threw and lands straight back in the
  fallback.

## 11a. Verified against the live API

A full 10-chapter Children's book was generated end to end on a real key
(*Lantern Fox and the Skybridge*, 3,135 words, ~12 calls, about four minutes).

Confirmed working: the separate title call; SSE streaming; the `===META===` contract
(honoured on **10 of 10** chapters, no truncation, no delimiter leaking into prose);
four distinct actions every turn; the choice loop with genuine continuity from the
chosen sentence; the achievement pacing guard (2 awarded, four chapters apart); the
ending at `totalChapters` with no actions and a real resolution; cover generation; and
PDF export with real prose.

Measured behaviour worth keeping in mind:

- **Chapters run long.** Against a 250-word target, actual chapters were 281–382 words
  (mean ~313, about 25% over). The target is a request, not a cap, so a Children's book
  lands nearer 3,100 words than 2,500. Scale the target down if length matters.
- **The summary self-regulated.** It ranged 232–435 words against the 500-word request
  and never exceeded it, so the uncapped-summary risk did not materialise here. Still
  unguarded, though.
- **Chapter latency was 17–27s** on `gpt-5` with `reasoning_effort: low`.
- **Model choice measurably changes adherence.** Head to head on the same Children's
  chapter-one prompt: `gpt-5` averaged 11.3-word sentences and ran 13% over the word
  target, reaching for abstract similes the Children's rules exclude; `gpt-5.5` averaged
  6.8 words, ran 6% over, and used roughly half the output tokens; `gpt-5.6-luna`
  averaged 7.0 words, hit the target exactly, and answered in 5.7s against 16.1s. All
  three honoured the `===META===` contract and returned valid metadata. Moved to
  `gpt-5.5`; `gpt-5.6-luna` is worth trying if speed matters more than range, though its
  prose reads pitched slightly younger.
- **Cover misspelling was a quality setting, not the model.** The first cover rendered
  "AND TIE SKYBRIDGE" for "AND THE SKYBRIDGE". A controlled comparison on the same
  prompt showed `gpt-image-1` at `medium` spells it correctly, and `gpt-image-2` spells
  it correctly even at `low` — at `low`, `gpt-image-1` has too little budget to form
  small function words. Fixed by moving to `gpt-image-2` at `medium`: the lettering is
  the point of the cover, and a misspelled title cannot be corrected without paying to
  regenerate the whole image.

## 11. Open risks

- **Key exposure.** A browser-held OpenAI key is readable by anything running in this
  origin and by anyone with the device. Acceptable for a personal app; document it in
  Settings, recommend a spend-limited key. If this ever ships publicly, it needs a proxy.
- **Long-story continuity.** Even a 500-word rolling summary across 30 chapters will
  lose detail. If drift shows up in testing, add a persistent "story bible" field
  (characters, places, established facts) that the model appends to rather than
  rewrites.
- **The summary is a request, not a cap.** The prompt asks for under 500 words but
  nothing truncates what comes back. A model that drifts to 900-word summaries grows
  every subsequent prompt with no error and no signal — gradual cost creep rather than a
  failure. The prose window, by contrast, is hard-sliced.
- **Achievement pacing**, per §6.5. At one per ten chapters a 10-chapter Children's
  book can legitimately end with zero achievements and an empty trophy sheet. If that
  reads as broken rather than rare, the fix is per-audience pacing rather than a lower
  global rate.
- **Streaming on iOS Safari.** Verified working in desktop Chrome; the home-screen PWA
  context on iOS remains unverified and is the one platform detail most likely to
  surprise.
- **Cover spelling.** Resolved by model and quality (§11a), but not guaranteed —
  image models can still misspell. If it recurs, compositing the text in canvas over
  wordless artwork would make it exact, at the cost of type that sits on the image
  rather than in it.
- **Genre switching mid-story** can produce tonal whiplash by design. The "deliberate
  shift" prompt flag mitigates it but won't eliminate it.
