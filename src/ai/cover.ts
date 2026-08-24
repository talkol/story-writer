import { describeApiError, OPENAI_BASE } from './client';
import { SETTING_DETAIL } from './prompts';
import { ApiError } from './stream';
import type { Audience, Story } from '../types';

/**
 * `gpt-image-2` (April 2026) rather than `gpt-image-1`. Compared directly on the same
 * prompt: the newer model produced a full painted illustration where the older one gave
 * a flat silhouette, and both rendered the title correctly — see the quality note below
 * for why that mattered.
 */
export const IMAGE_MODEL = 'gpt-image-2';

/** 2:3 portrait, matching the cover tile. Downscaled to 512×768 before storage. */
const IMAGE_SIZE = '1024x1536';

/**
 * Quality is the setting that governs whether the title is spelled correctly.
 *
 * At `low`, `gpt-image-1` rendered "AND TIE SKYBRIDGE" for "AND THE SKYBRIDGE" — the
 * model has too little budget to form small function words. At `medium` the same model
 * spelled it perfectly, and `gpt-image-2` spells it correctly even at `low`. Since the
 * lettering is the whole point of the cover, this is not the place to economise: the
 * result is downscaled to 512×768 regardless, but a misspelled title is unfixable
 * without paying to generate the image again.
 */
const IMAGE_QUALITY = 'medium';

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
    `set large in ${ART[story.audience].lettering} across the cover. ` +
    `Below the title, smaller and letter-spaced, the single word "${story.genre.toUpperCase()}". ` +
    `Both must be crisp, correctly spelled, and clearly legible. No other text anywhere.`
  );
}

interface ArtDirection {
  /** Tier 0: how the illustrated cover is painted. */
  illustration: string;
  /** Tier 1: shapes and colour only, once the illustration has been refused. */
  graphic: string;
  /** How the title and genre are set — applies at every tier. */
  lettering: string;
  /** Audience phrasing that reads as English rather than as a field value. */
  readership: string;
}

/**
 * Per-audience art direction, the visual counterpart to STYLE in `prompts.ts`.
 *
 * Naming the audience is not the same as directing the cover. Every book used to get
 * "a strong silhouette and dramatic light" — a thriller instruction — with a trailing
 * "for children" left to argue against it, which is why children's covers came out
 * moody. The illustration style, the fallback graphic style and the lettering all now
 * follow the reader.
 */
const ART: Record<Audience, ArtDirection> = {
  Children: {
    illustration:
      'a picture-book cover: bright flat colour, rounded friendly shapes, soft even light, one clear character or object, nothing menacing or shadowed',
    graphic: 'simple cut-paper shapes in bright, warm colour',
    lettering: 'chunky rounded sans-serif capitals',
    readership: 'for children',
  },
  'Young Adults': {
    illustration:
      'a bold graphic illustration: high contrast, saturated colour, one striking figure or object, atmosphere and tension rather than menace',
    graphic: 'bold geometric shapes in high-contrast colour',
    lettering: 'clean modern sans-serif capitals',
    readership: 'for young adult readers',
  },
  Adults: {
    illustration: 'a painted illustration with a strong silhouette and dramatic light',
    graphic: 'restrained abstract shapes, a muted palette and visible texture',
    lettering: 'elegant serif capitals',
    readership: 'for adult readers',
  },
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export function buildCoverPrompt(story: Story, tier: number): string {
  const art = ART[story.audience];
  const genre = story.genre.toLowerCase();
  const setting = story.setting.toLowerCase();
  const mood =
    `${article(genre)} ${genre} story set in ${article(setting)} ${setting} world ` +
    `(${SETTING_DETAIL[story.setting]}), ${art.readership}`;

  if (tier <= 0) {
    return `Front cover of a printed book, ${art.illustration}, evoking ${mood}. ${typography(story)}`;
  }
  if (tier <= 1) {
    // The audience's style carries into the fallback, but the genre does not: this tier
    // exists because the narrative imagery was refused, and putting "a crime story"
    // back would re-arm the filter this degradation is meant to slip past.
    return (
      `Front cover of a printed book ${art.readership}. Simple graphic design: ` +
      `${art.graphic}, drawn from ${setting} — ${SETTING_DETAIL[story.setting]} — ` +
      `but no people and no scene. ${typography(story)}`
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
