import { describeApiError, OPENAI_BASE } from './client';
import { ApiError, TEXT_MODEL } from './stream';
import { SETTING_DETAIL, TITLE_REGISTER } from './prompts';
import { AUDIENCE_PROFILE, type CastMember, type Story } from '../types';

/**
 * Names a book and its cast from the genre triple alone, before any prose exists.
 *
 * The title used to arrive with chapter one's metadata, which meant the cover could not
 * be made until the whole chapter had been written — and a story whose first chapter
 * never generated stayed untitled and coverless forever. Naming the book up front
 * decouples the two: the cover is generated in parallel with chapter one rather than
 * after it.
 *
 * The cast rides along in the same call rather than taking one of its own. It has to be
 * decided before chapter one for the same reason the title does — a chapter that invents
 * its own names has already fixed them — and folding it in costs no extra round trip and
 * no extra wait before the book starts.
 *
 * Not streamed: this is a small, one-shot request.
 */
export async function nameStory(opts: {
  story: Story;
  apiKey: string;
  signal: AbortSignal;
}): Promise<{ title: string; cast: CastMember[] }> {
  const { story, apiKey, signal } = opts;
  const profile = AUDIENCE_PROFILE[story.audience];

  const prompt =
    `Name ${article(story.genre)} ${story.genre.toLowerCase()} book set in ` +
    `${article(story.setting)} ${story.setting.toLowerCase()} world — ` +
    `${SETTING_DETAIL[story.setting]} — ` +
    `written for ${story.audience.toLowerCase()} (${profile.label}).\n\n` +
    `Reply with a single JSON object and nothing else:\n` +
    `{\n` +
    `  "title": "the book's title, two to six words, evocative and concrete. ` +
    // The naming call cannot see the chapter prompt's STYLE block, so the audience's
    // language level has to be restated here or the title drifts above the prose.
    `${TITLE_REGISTER[story.audience]} ` +
    `No subtitle, no quotation marks, no trailing punctuation",\n` +
    `  "cast": [five characters, each {"name": "...", "bio": "..."}]\n` +
    `}\n\n` +
    `The cast is the book's principal characters, decided before a word is written.\n` +
    `- Their names must belong to the world described above: the right language, the ` +
    `right period, the right kind of name for the place. A name that would be at home ` +
    `in a different setting is wrong, however pleasant it sounds.\n` +
    // Without this the model reaches for the same small set of names every time — the
    // reason two books from different prompts kept arriving with near-identical casts.
    `- Choose distinctive names you would be unlikely to reach for again. Avoid the ` +
    `names that come to mind first; they are the ones every other book already uses.\n` +
    `- Give each a two-sentence bio: one sentence on who they are and where they come ` +
    `from, one on what they are like to be around. Enough to write them as a person ` +
    `rather than a role.\n` +
    `- Vary them: they should not all be the same age, temperament, or standing.`;

  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        reasoning_effort: 'low',
      }),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('Could not reach api.openai.com.');
  }

  if (!res.ok) throw new ApiError(await describeApiError(res), res.status);

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content ?? '';

  /*
   * The title is required; the cast is not.
   *
   * A book with no title can be neither named nor given a cover, so a response we cannot
   * read a title out of is a genuine failure. A missing or malformed cast is not: the
   * chapter prompt simply omits the block and the model names people itself, exactly as
   * it did before casts existed. Degrading here rather than throwing keeps a JSON slip
   * from costing the reader their cover.
   */
  const parsed = parseNaming(raw);
  const title = cleanTitle(parsed?.title ?? salvageTitle(raw));
  if (!title) throw new ApiError('The model returned no title.');
  return { title, cast: parsed?.cast ?? [] };
}

/**
 * A title out of a response that would not parse.
 *
 * Two cases behave very differently and must not be conflated. A reply that is simply
 * the title as text — what this call used to return, and what a model still does when it
 * ignores the JSON instruction — is perfectly usable. A reply that is *truncated JSON*
 * is not: taking it verbatim once put `{"title":"…","cast":[{"name":` on a book cover.
 *
 * So the title field is picked out of the wreckage if it survived, and anything still
 * looking like JSON is refused, which fails the naming attempt and lets the reconciler
 * retry rather than printing a brace on the cover.
 */
function salvageTitle(raw: string): string {
  const field = raw.match(/"title"\s*:\s*"([^"\\]+)"/);
  if (field) return field[1];
  return /[{}]|"\s*:/.test(raw) ? '' : raw;
}

/** Reads the naming JSON, tolerating a fenced block or prose either side of it. */
function parseNaming(raw: string): { title?: string; cast: CastMember[] } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;

  const { title, cast } = obj as { title?: unknown; cast?: unknown };
  const members = Array.isArray(cast)
    ? cast
        .map((c) => {
          const { name, bio } = (c ?? {}) as { name?: unknown; bio?: unknown };
          return {
            name: typeof name === 'string' ? name.trim() : '',
            bio: typeof bio === 'string' ? bio.trim() : '',
          };
        })
        // A nameless entry cannot be referred to, so it is not a character.
        .filter((c) => c.name.length > 0)
    : [];

  return { title: typeof title === 'string' ? title : undefined, cast: members };
}

/** Models like to wrap titles in quotes or append a full stop however firmly asked not to. */
export function cleanTitle(raw: string): string {
  return raw
    .trim()
    .split('\n')[0]
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.]+$/, '')
    .replace(/^(title|the title is)\s*[:\-—]\s*/i, '')
    .trim()
    .slice(0, 80);
}

/**
 * "a" or "an" for a genre or setting name.
 *
 * A plain vowel test, which is safe only because both lists are closed and contain no
 * word where spelling and sound disagree — no "hour", no "university". Adding such a
 * word to GENRES or SETTINGS would need this revisited.
 */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}
