# Story App

An AI-driven, choose-your-own-adventure story maker. Pick a genre, the AI writes a
chapter, read it like a book, then choose one of four actions to steer the plot —
until the story reaches its ending.

Runs entirely in the browser. No backend, no accounts, no server-side state. Stories
live in your browser's local storage; the AI is called directly from the page with
your own OpenAI API key.

The interface is modelled on Apple Books — white ground, the iOS system palette and
type scale, collapsing large titles, and systemBlue as the tint. Fonts resolve to
the real system faces on Apple devices (SF Pro for UI, New York for reading); icons
are [Phosphor](https://phosphoricons.com), self-hosted as a WOFF2. See
[SPEC.md §1a](SPEC.md) for why those choices and not SF Symbols.

See [SPEC.md](SPEC.md) for the full product and technical spec.

> **Status: all 10 milestones complete.** The app is playable end to end: create a story, read
> chapter one as it streams in, choose what happens next, collect achievements, and
> carry on to the ending. Covers are generated in the background and retry themselves
> if they fail, and a finished story exports as a PDF book. Add an OpenAI key in
> Settings first.
>
> Verified end to end against the live OpenAI API: a full 10-chapter book, cover and
> PDF. See [SPEC.md §11a](SPEC.md) for what that run measured, and §11 for remaining
> risks.

> **Note on cost:** covers generate automatically for any story that lacks one,
> including stories created before this existed. With a key saved, opening the app will
> start generating them, one at a time. Each cover also costs a short text call to name
> the book, if it has no title yet.

---

## Requirements

- **Node 18, 20, or 22+** (developed on 22.11). Check with `node -v`.
- A modern browser. The reader targets mobile Safari and iPad Safari first.
- An **OpenAI API key**, once the AI milestones land. Not needed to run what exists today.

## Install

```bash
npm install
```

## Develop

```bash
npm run dev
```

Opens on <http://localhost:5173>. The server binds to `0.0.0.0`, so you can also open
it on a phone or iPad on the same network — visit `http://<your-mac-ip>:5173`. That is
the fastest way to check the reader on a real device, and it is worth doing often.

Note that a LAN address over plain http is **not a secure context**, so browser APIs
gated on one are unavailable there even though they work on `localhost`. The app
handles this for id generation (`crypto.randomUUID`); keep it in mind before reaching
for anything else on `window.crypto`.

### Dev-only tooling

Development builds seed three fixture stories on first load (a 4-chapter YA mystery
with an achievement, a children's book, and an unstarted draft) so the UI can be built and
reviewed before the AI client exists. Two get generated cover blobs, so the
IndexedDB→object-URL path is exercised; the third stays coverless so the placeholder
cover stays visible. Helpers are on `window.__dev`:

| Call | What it does |
|---|---|
| `__dev.seedFixtures()` | Replace the library with the fixtures |
| `__dev.clearStories()` | Empty the library |
| `__dev.selftest()` | Run the 51-assertion storage and AI smoke test |
| `__dev.mockOpenAI(mode)` | Serve a canned OpenAI stream instead of the network |
| `__dev.stopMock()` | Restore the real `fetch` |
| `__dev.mockImages(mode)` | Mock the image endpoint: `'ok'`, `'fail'`, `'refuse'` |
| `__dev.reconcileOnce()` | Run one cover-reconciliation pass, ignoring pacing |
| `__dev.imageCallLog()` | Prompts sent to the mocked image endpoint |

`__dev.selftest()` exercises migrations, store CRUD, the localStorage round-trip,
settings persistence, the IndexedDB cover pipeline, and the AI parser, prompt builder
and chapter-commit logic against a real browser. Run it after touching anything under
`src/storage/` or `src/ai/`. It saves and restores your data, so it is safe to run
against a populated library. Results print with `console.table`.

`__dev.mockOpenAI(mode)` replaces `fetch` with a canned SSE stream so the whole
generation path can be exercised without a key or a charge. Modes: `'ok'`,
`'truncated'`, `'badjson'`, `'http401'`, `'http429'`, `'network'`. A second argument
sets the per-chunk delay in ms — pass `0` for an instant stream, or `30` to leave it
running long enough to test Cancel.

Everything under `src/dev/` is reached only through a dynamic import inside an
`import.meta.env.DEV` branch, so Rollup drops it — fixture prose included — from
production builds.

### Other scripts

```bash
npm run typecheck
```

```bash
npm run fonts
```

`fonts` regenerates the TTFs the PDF exporter embeds, by decompressing Literata's WOFF2
Latin subsets. The output is checked in, so you only need this if the font changes.

```bash
npm run build
```

```bash
npm run preview
```

`preview` serves the built `dist/` on <http://localhost:4173>, which is how you check
a production build before publishing. Note that fixtures and `window.__dev` are absent
there — that is expected, and is the point.

## Project layout

```
src/
  main.tsx App.tsx types.ts styles.css
  screens/     one component per screen in the spec
  components/  NavBar, Stub, and shared UI as it lands
  storage/     the persistence layer — see below
  dev/         fixtures, devtools, selftest (never shipped)
```

**Storage** is the part worth knowing before you change anything:

- `stories.ts` is the single source of truth for the library. It holds the collection
  in memory, mirrors every mutation to localStorage, and exposes
  `subscribe`/`getSnapshot` for `useSyncExternalStore`. Screens bind through
  `useStories()` and `useStory(id)`.
- `migrations.ts` wraps persisted data in a `{ schemaVersion, data }` envelope. When
  you change a stored shape, bump `SCHEMA_VERSION` in `keys.ts` **and** add the
  matching migration — a version bump without one will silently discard user data.
  Migrated data is written back on first read, so storage converges on the current
  schema rather than being re-migrated forever. Schema v2 renamed "part" to
  "chapter" throughout; `MIGRATIONS[1]` is a worked example.
- `quota.ts` normalises `QuotaExceededError` across browsers into a `StorageFullError`
  with a message worth showing a user.
- `covers.idb.ts` keeps cover images in IndexedDB as Blobs, downscaled to 512×768
  JPEG first. Covers must never go into localStorage — a full-size image is 1–2 MB as
  base64 and would exhaust the ~5 MB quota after two or three books.

## Publish

The build is a static bundle — HTML, one JS file, one CSS file. Any static host works,
and no server configuration or SPA rewrite rule is needed, because routing is
hash-based (`/#/library`) and never touches the server path.

```bash
npm run build
```

Everything to publish is then in `dist/`.

`base` is set to `./` in `vite.config.ts`, so the build runs from any path — a domain
root, a GitHub Pages project subdirectory, or a nested folder. Do not change it to an
absolute path unless you also stop deploying to subdirectories.

**Drag-and-drop hosts** — Netlify Drop, Cloudflare Pages, Surge: upload or drop the
`dist/` folder. Done.

**Connected to a git repo** — set the build command to `npm run build` and the publish
directory to `dist`. This is the standard Vite setup on Netlify, Vercel, and
Cloudflare Pages; none of them need a framework preset beyond Vite.

**GitHub Pages** — already configured. [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds on every push to `main` and publishes via the official Pages actions; you can also
re-deploy from the Actions tab without a commit. Two files in `public/` reach the site
root: `CNAME` (the custom domain, `reading.land`) and `.nojekyll` (stops Jekyll
processing the output).

One-time setup in the repo: **Settings → Pages → Source: GitHub Actions**, then set the
custom domain and enable **Enforce HTTPS** once it appears.

DNS for the apex domain:

| Type | Value |
|---|---|
| A | 185.199.108.153 |
| A | 185.199.109.153 |
| A | 185.199.110.153 |
| A | 185.199.111.153 |
| AAAA | 2606:50c0:8000::153 |
| AAAA | 2606:50c0:8001::153 |
| AAAA | 2606:50c0:8002::153 |
| AAAA | 2606:50c0:8003::153 |

**HTTPS is not optional.** `crypto.randomUUID` and anything else gated on a secure
context is undefined over plain http — see the LAN-address note above. The app has a
fallback for id generation, but serve the site over HTTPS regardless.

**Any web server** — copy `dist/` anywhere it will be served over HTTP. Note that
opening `dist/index.html` directly from the filesystem will *not* work: the bundle
uses ES modules, and browsers block those over `file://`.

### Before you publish publicly

The app calls the OpenAI API straight from the browser, using a key held in the
visitor's own local storage. That means:

- **Your key is never bundled.** There is no key in `dist/`, and publishing the site
  does not expose yours. Each visitor enters their own in Settings.
- **A published site is BYO-key.** Anyone who opens it sees an empty library and is
  asked for a key before they can create a story. They pay for their own usage.
- **A browser-held key is readable** by anything running on that origin and by anyone
  with access to that device. Use a dedicated key with a spend limit. This is fine for
  a personal app; if you ever want to supply the key yourself for other people to use,
  that needs a server-side proxy, which this project deliberately does not have.

## Troubleshooting

**Stale modules or a 404 for a file you moved** — Vite caches the module graph.
Restart `npm run dev`.

**Fixtures are gone and won't come back** — they seed only when the library is empty.
Run `__dev.seedFixtures()`.

**"Storage full" when saving** — the localStorage quota is roughly 5 MB. Export and
remove an older story. If you hit this with only a few stories, something is writing
image data to localStorage instead of IndexedDB; that is a bug worth chasing.

**Nothing renders after a schema change** — check the console for
`[storage] payload version N is newer than M`. That means data was written by a build
with a higher `SCHEMA_VERSION` than the one you are running. It is refused rather than
guessed at. Run `__dev.clearStories()` to reset.
