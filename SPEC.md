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
| Text model | `gpt-5` |
| Cover images | AI-generated (`gpt-image-1`), required at story creation |
| Generation UX | Single streaming call; prose renders as it arrives |
| Pagination | Measured reflow against the live container |
| iPad | Two-page spread in landscape, single page in portrait |
| Story length | Audience-driven: Children 10 parts, Young Adults 20, Adults 30 |
| Part length | Audience-driven: ~250 / ~500 / ~800 words |
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
- **Part** (a.k.a. chapter) — one AI generation. Produces prose, 4 actions, an optional
  achievement, and a refreshed plot summary. A story is a fixed number of parts.
- **Page** — one screenful of rendered text. Pages are *derived* from part prose at
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
  unlockedAtPart: number;
}

type Part =
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
  totalParts: number;               // 10 | 20 | 30, fixed at creation
  parts: Part[];
  achievements: Achievement[];
  pendingActions: string[];         // the 4 choices awaiting the reader; [] when finished
  summary: string;                  // rolling plot summary, ~200 words, AI-maintained
  status: 'draft' | 'reading' | 'finished';
  /** Resume anchor. A page number would break on rotate or font-size change. */
  readingPosition: { partIndex: number; wordOffset: number };
  /** Set when the genre triple changed mid-story, so the next prompt can bridge it. */
  genreChangedAtPart?: number;
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
- 2-column grid of covers at 2:3 portrait. Below each: story title, and a "…" button
  opening a menu with **Export PDF** and **Remove** (Remove confirms first — it is
  irreversible and there is no cloud copy).
- First cell is **Create New**: a dashed-border tile with a "+" and the label.
- A gear icon in the nav bar opens **Settings**.
- The "…" menu is a bottom action sheet rather than an anchored popover: no
  positioning math, large touch targets, identical behaviour on phone and iPad.
- Remove asks for confirmation, then deletes the story *and* its cover blob. Deleting
  the record alone would orphan the image in IndexedDB.
- Tapping a story opens Read at `lastReadPage`.
- Empty state: only the Create New tile plus a one-line hint.
- Unfinished stories show a subtle progress indicator (`Part 4 of 20`).

### 4.2 Genre
Two modes, same component:
- **Creation mode** (from Create New) — three labeled groups of pill buttons
  (Audience / Genre / Setting), single-select each, current selection highlighted.
  Instruction line at the top: *"Choose what kind of story you'd like. This shapes
  the whole book."* A **Confirm** button, disabled until all three are chosen.
  Defaults preselected (Children / Adventure / Fantasy) so Confirm is reachable fast.
  Audience additionally sets `totalParts` and part length — show that inline:
  *"Children — a short book, 10 chapters."*
- **Edit mode** (from the Read screen) — same pills, prefilled from the story.
  Audience is editable but does **not** change `totalParts` on an in-progress story
  (that would strand the reader mid-arc); show a note saying so. Confirm button reads
  **Save**. Changes apply to future parts only, and the next generation prompt is told
  the story is deliberately shifting so the transition is written, not jarring.

### 4.3 Actions
- Title "Actions". Four full-width sentence buttons, generous tap targets, each a
  distinct way to push the plot.
- Tapping one immediately: records `chosenAction`, navigates to Read, and starts
  generating the next part.
- On the final part there are no actions — the reader never reaches this screen; the
  book ends with a "The End" page instead.

### 4.4 Read
- Title "Read". Tap right third → next page, left third → previous page. Center tap
  toggles the nav chrome (so the reader can go fullscreen).
- Also support horizontal swipe, and Left/Right arrow keys for desktop testing.
- **Page-turn animation**: CSS 3D transform, `rotateY` on the outgoing page around its
  spine edge with `transform-style: preserve-3d`, plus a shadow gradient that sweeps
  across the incoming page. ~350 ms, `ease-in-out`. Direction mirrors travel direction.
  Respect `prefers-reduced-motion` with a cross-fade fallback.
- Nav bar: **trophy icon** → Achievements modal; **book/tag icon** → Genre in edit mode.
  A page indicator (`12 / 47`) sits at the bottom.
- Reaching the last generated page when actions are pending shows a "What happens next?"
  affordance leading to the Actions screen.
- While a part is generating, the newly arriving text is appended live; the reader can
  begin reading page 1 of the new part while the tail is still being written.

### 4.5 Achievements (modal)
- Title "Achievements", "X" to dismiss, scrollable list of unlocked achievements for
  *this* story, each showing title, description, and the part number.
- Empty state: "No achievements yet — keep making bold choices."

### 4.6 Achievement page
- A page inside the book, not a separate route. Centered, decorated: "Achievement
  Unlocked", the title in display type, the description sentence beneath, a trophy
  glyph. Appears at the end of the part in which it was earned, and it participates in
  page navigation and PDF export like any other page.

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
3. Fire the part-1 generation and the cover generation **in parallel**; navigate
   straight to Read so the reader is never staring at a blank screen.
4. Title comes from the part-1 response. Until it arrives, the library tile reads
   "Untitled Story".

**Read → choose → continue**
1. Reader pages to the end of the latest part.
2. "What happens next?" → Actions screen.
3. Tap an action → back to Read, generation starts, text streams in.
4. If the response includes an achievement, append an achievement page after the prose.
5. Repeat until `parts` reaches `totalParts`.

**Ending**
- When generating parts `totalParts - 1` and `totalParts`, the prompt is told the story
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

Because `gpt-5` is a reasoning model, time-to-first-token is dominated by reasoning.
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
- If the stream ends before `===META===`, keep the prose, mark the part
  `metaMissing`, and offer a "Continue" retry that re-requests just the metadata from
  the same context. A truncated raw-JSON stream would have lost everything.
- Validate the parsed meta with a small runtime guard (exactly 4 non-empty actions;
  achievement either null or `{title, description}`) and retry once on violation.

### 6.3 Prompt inputs
Every generation sends:
1. Rolling plot summary (capped ~200 words; the model rewrites it each part).
2. The last ~400 words of prose verbatim, for voice and immediate continuity.
3. Audience, genre, setting — plus a flag if they were just changed.
4. The full achievement list for this story (titles + descriptions), so it doesn't
   repeat one.
5. `partIndex` / `totalParts`, and target word count for this audience.
6. The action the reader just chose (absent on part 1).
7. Pacing signal: `partsSinceLastAchievement`.

### 6.4 System prompt sketch

```
You are a novelist writing an interactive book, one chapter at a time.

AUDIENCE: {audience}   GENRE: {genre}   SETTING: {setting}
This is chapter {n} of {total}. Write approximately {wordTarget} words.
{if n >= total-1}: The book is nearly over. Begin converging the plot toward a
satisfying resolution.
{if n == total}: This is the FINAL chapter. Resolve every thread and end the story.
Do not offer any actions.

Style rules:
- Children: simple sentences, warm tone, no violence or frightening imagery, clear
  moral texture.
- Young Adults: vivid, emotionally driven, real stakes, no explicit content.
- Adults: full literary range, mature themes handled with craft, not shock.

Continuity: honor the summary and recent prose exactly. Never contradict established
facts, names, or the protagonist's voice.

After the prose, on its own line, output ===META=== followed by a single JSON object:
{ "actions": [4 distinct one-sentence choices, each a concrete action the protagonist
   could take next, meaningfully divergent from one another],
  "achievement": null, or {"title": 2-3 words, "description": one sentence} if the
   reader's last choice or this chapter earned a genuine milestone,
  "summary": the full plot so far in under 200 words, rewritten to include this
   chapter }
```

### 6.5 Achievements
The model decides, freely, as you chose. Two guardrails that keep it from firing every
chapter or never firing, without taking the decision away from it:
- Pass `partsSinceLastAchievement` and instruct: award one only for a genuinely
  distinctive turn; typically no more often than every 5 chapters.
- Client-side rejection: if the model returns an achievement fewer than 3 parts after
  the previous one, drop it and log it. Cheap insurance against runaway pacing.

Expect real pacing variance here — it's the accepted cost of the model deciding. If it
turns out too noisy in practice, the client-gated variant is a small change.

### 6.6 Cover generation
One `gpt-image-1` call at creation, prompted from title + audience + genre + setting,
explicitly asking for a book-cover composition with no text or lettering (models render
text badly; the title is drawn over it in the UI). Portrait 2:3. Downscale to 512×768
JPEG before storing. Failure leaves `coverImageId: null` and shows a neutral placeholder
tile with a **Retry cover** item in the "…" menu — a failed image must never block the
story.

### 6.7 Cost and errors
- Rough per-book scale: an adult book is 30 generations over a growing-but-capped
  context; children's books are a fraction of that. Verify current per-token pricing
  before quoting numbers to anyone — model pricing changes.
- Handle explicitly: 401 (bad key → Settings), 429 (rate/quota → retry with backoff,
  distinguish "rate limited" from "out of credit"), 5xx (retry twice), network offline,
  user abort, content refusal (rare, but surface it plainly and offer regeneration).
- Every failure must leave the story in a consistent state — never a half-written part
  with no actions and no way forward.

---

## 7. Pagination engine

- A hidden measuring container mirrors the reader's exact width, font, line-height, and
  padding.
- Break the part's prose into word-level tokens; binary-search the largest prefix whose
  rendered height fits the container. That prefix is a page; repeat from the remainder.
- Never break inside a word; avoid single-line orphans at a page end.
- Recompute on: viewport resize, orientation change, font-scale change. Preserve the
  reader's position by anchoring to a word offset, not a page number — this is why
  `lastReadPage` is backed by a stored word index.
- Cache the computed page breaks per (story, layout signature) so paging is instant on
  re-entry; invalidate when the signature changes.
- Achievement pages are inserted into the page sequence as fixed, unbreakable units.
- Landscape iPad: the measuring container is one column of the spread; pages advance
  two at a time.

---

## 8. PDF export

Client-side with `jsPDF`.
1. Cover page: full-bleed cover image, title overlaid.
2. Title page: title, genre triple, date.
3. Body: prose reflowed to the PDF page size (its own pagination, independent of screen
   pagination), chapter breaks between parts.
4. Achievement pages rendered as decorated inserts in place.
5. Final page: an index of all achievements.
Runs off the main thread if it blocks noticeably; show a progress state either way.

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
3. **Genre + creation** — both modes, story record creation.
4. **Read + pagination** — measured reflow, tap zones, page-turn animation, iPad spread.
   Built against the fixture.
5. **AI generation** — streaming client, delimited parser, prompt assembly, error paths.
6. **Choice loop** — Actions screen, continuation, ending logic at `totalParts`.
7. **Achievements** — modal, achievement pages, pacing guard.
8. **Covers** — image generation, downscale, IndexedDB, placeholder and retry.
9. **PDF export**.
10. **Polish** — reduced motion, resume position, quota handling, offline, iOS Safari
    pass (100dvh, safe-area insets, no rubber-band scroll on the reader).

---

## 11. Open risks

- **Key exposure.** A browser-held OpenAI key is readable by anything running in this
  origin and by anyone with the device. Acceptable for a personal app; document it in
  Settings, recommend a spend-limited key. If this ever ships publicly, it needs a proxy.
- **Long-story continuity.** A 200-word rolling summary across 30 chapters will lose
  detail. If drift shows up in testing, add a persistent "story bible" field (characters,
  places, established facts) that the model appends to rather than rewrites.
- **Achievement pacing**, per §6.5.
- **Streaming on iOS Safari.** Verify `fetch` streaming behaves in a home-screen PWA
  context early — it's the one platform detail most likely to surprise.
- **Genre switching mid-story** can produce tonal whiplash by design. The "deliberate
  shift" prompt flag mitigates it but won't eliminate it.
