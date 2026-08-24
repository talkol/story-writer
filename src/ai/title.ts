import { describeApiError, OPENAI_BASE } from './client';
import { ApiError, TEXT_MODEL } from './stream';
import { AUDIENCE_PROFILE, type Story } from '../types';

/**
 * Names a book from its genre triple alone, before any prose exists.
 *
 * The title used to arrive with chapter one's metadata, which meant the cover could not
 * be made until the whole chapter had been written — and a story whose first chapter
 * never generated stayed untitled and coverless forever. Naming the book up front
 * decouples the two: the cover is generated in parallel with chapter one rather than
 * after it.
 *
 * Not streamed, and deliberately tiny: this is a handful of tokens.
 */
export async function generateTitle(opts: {
  story: Story;
  apiKey: string;
  signal: AbortSignal;
}): Promise<string> {
  const { story, apiKey, signal } = opts;
  const profile = AUDIENCE_PROFILE[story.audience];

  const prompt =
    `Invent a title for a ${story.genre.toLowerCase()} book set in a ${story.setting.toLowerCase()} world, ` +
    `written for ${story.audience.toLowerCase()} (${profile.label}).\n\n` +
    `Reply with the title and nothing else. Two to six words. Evocative and concrete. ` +
    `No subtitle, no quotation marks, no explanation, no trailing punctuation.`;

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
  const title = cleanTitle(body.choices?.[0]?.message?.content ?? '');
  if (!title) throw new ApiError('The model returned no title.');
  return title;
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
