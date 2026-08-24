import { describeApiError, OPENAI_BASE } from './client';
import { ApiError } from './stream';
import type { Audience, Story } from '../types';

export const IMAGE_MODEL = 'gpt-image-1';

/** 2:3 portrait, matching the cover tile. Downscaled to 512×768 before storage. */
const IMAGE_SIZE = '1024x1536';

/**
 * Low quality is deliberate: the result is downscaled to 512×768 for storage anyway,
 * and this is the one call in the app that costs cents rather than fractions of one.
 * One line to raise if covers look thin.
 */
const IMAGE_QUALITY = 'low';

/** Raised when the model declines the prompt itself, rather than failing to run. */
export class PromptRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptRefusedError';
  }
}

/**
 * The model letters the cover itself: the title and genre are part of the generated
 * image rather than drawn over it afterwards. That means a cover cannot be made before
 * the story has a title — see `isCoverPending` in the reconciler.
 *
 * Prompts still degrade across tiers when the model refuses, but every tier keeps the
 * lettering; what falls away is the narrative imagery, which is what tends to trip the
 * safety filter.
 */
function typography(story: Story): string {
  return (
    `The book's title reads exactly "${story.title}" — spell it precisely, word for word, ` +
    `set large in elegant serif capitals across the cover. ` +
    `Below the title, smaller and letter-spaced, the single word "${story.genre.toUpperCase()}". ` +
    `Both must be crisp, correctly spelled, and clearly legible. No other text anywhere.`
  );
}

/** Audience phrasing that reads as English rather than as a field value. */
const READERSHIP: Record<Audience, string> = {
  Children: 'for children',
  'Young Adults': 'for young adult readers',
  Adults: 'for adult readers',
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export function buildCoverPrompt(story: Story, tier: number): string {
  const genre = story.genre.toLowerCase();
  const setting = story.setting.toLowerCase();
  const mood = `${article(genre)} ${genre} story set in ${article(setting)} ${setting} world, ${READERSHIP[story.audience]}`;

  if (tier <= 0) {
    return (
      `Front cover of a printed book, painted illustration with a strong silhouette and ` +
      `dramatic light, evoking ${mood}. ${typography(story)}`
    );
  }
  if (tier <= 1) {
    return (
      `Front cover of a printed book. Simple graphic design: ${story.setting.toLowerCase()} ` +
      `shapes, texture and colour, no people and no scene. ${typography(story)}`
    );
  }
  return (
    `A minimal typographic book cover on a plain textured background, no imagery at all. ` +
    `${typography(story)}`
  );
}

/**
 * Generates one cover and returns it as a Blob.
 *
 * Asks for base64 rather than a URL: a returned image URL is short-lived and
 * cross-origin, which would taint the canvas that `normalizeCover` draws into and
 * break the downscale.
 */
export async function generateCover(opts: {
  story: Story;
  apiKey: string;
  tier: number;
  signal: AbortSignal;
}): Promise<Blob> {
  const { story, apiKey, tier, signal } = opts;

  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE}/images/generations`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: buildCoverPrompt(story, tier),
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
        n: 1,
      }),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('Could not reach api.openai.com.');
  }

  if (!res.ok) {
    const detail = await describeApiError(res.clone());
    if (await isRefusal(res)) throw new PromptRefusedError(detail);
    throw new ApiError(detail, res.status);
  }

  const body = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = body.data?.[0];
  if (!first) throw new ApiError('The image response contained no image.');

  if (first.b64_json) return base64ToBlob(first.b64_json);

  // Fallback for a URL-returning deployment. Cross-origin, so it may fail to decode.
  if (first.url) {
    const img = await fetch(first.url, { signal });
    if (!img.ok) throw new ApiError('Could not download the generated image.');
    return img.blob();
  }
  throw new ApiError('The image response was in an unrecognised shape.');
}

/** A refusal is a prompt problem, not a transient one — it needs a different prompt. */
async function isRefusal(res: Response): Promise<boolean> {
  if (res.status !== 400) return false;
  const text = await res
    .json()
    .then((b: { error?: { code?: string; message?: string } }) =>
      `${b.error?.code ?? ''} ${b.error?.message ?? ''}`.toLowerCase(),
    )
    .catch(() => '');
  return /moderation|safety|content[_ ]policy|rejected|not allowed/.test(text);
}

function base64ToBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

/**
 * Checks whether this key can reach the image model at all, without generating
 * anything. Free, and it catches the most common cover failure by far: `gpt-image-1`
 * requires the OpenAI *organization* to be verified, which is a separate step from
 * adding billing. Chat completions keep working while image generation 403s, so the
 * symptom is "stories write but covers never appear".
 */
export async function checkImageAccess(apiKey: string): Promise<{ ok: boolean; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE}/models/${IMAGE_MODEL}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return { ok: false, message: 'Could not reach api.openai.com. Check your connection.' };
  }

  if (res.ok) return { ok: true, message: '' };

  const detail = await res
    .json()
    .then((b: { error?: { message?: string } }) => b.error?.message ?? '')
    .catch(() => '');

  if (res.status === 403 || /verif/i.test(detail)) {
    return {
      ok: false,
      message:
        detail ||
        `Your OpenAI organization must be verified to use ${IMAGE_MODEL}. That is separate from billing — verify at platform.openai.com under Settings → Organization → General, then wait a few minutes.`,
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      message: `This key cannot see the ${IMAGE_MODEL} model. Check the key belongs to a project with image access.`,
    };
  }
  return { ok: false, message: detail || `OpenAI returned ${res.status}.` };
}
