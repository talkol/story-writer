/**
 * The model streams prose first, then a delimiter, then one JSON object. Everything
 * before the delimiter can be shown to the reader immediately with zero parsing, and
 * a stream that dies early costs only the metadata rather than the whole chapter.
 */

export interface ChapterMeta {
  title?: string;
  actions: string[];
  achievement: { title: string; description: string } | null;
  summary: string;
}

/** Tolerant of spacing and of the model using more or fewer equals signs. */
const DELIMITER = /\n?\s*={2,}\s*META\s*={2,}\s*/;

export function splitOnDelimiter(raw: string): { prose: string; metaRaw: string | null } {
  const match = DELIMITER.exec(raw);
  if (!match) return { prose: raw, metaRaw: null };
  return {
    prose: raw.slice(0, match.index),
    metaRaw: raw.slice(match.index + match[0].length),
  };
}

/**
 * Prose safe to display while the stream is still running. Once any part of the
 * delimiter starts arriving it must be withheld, or the reader briefly sees "==" and
 * then "===MET" appear at the end of the last paragraph.
 */
export function displayableProse(raw: string): string {
  const split = splitOnDelimiter(raw);
  if (split.metaRaw !== null) return split.prose.trimEnd();

  // Hold back a partial delimiter forming at the tail.
  const partial = /\n?\s*=+[\s=]*(M(E(T(A)?)?)?)?[\s=]*$/.exec(raw);
  if (partial && partial.index > 0 && partial[0].includes('=')) {
    return raw.slice(0, partial.index).trimEnd();
  }
  return raw;
}

export class MetaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaFormatError';
  }
}

/** Strips ``` fences, which models add even when told to emit bare JSON. */
function unfence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function parseMeta(
  raw: string,
  expect: { title: boolean; actions: boolean },
): ChapterMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(raw));
  } catch {
    throw new MetaFormatError('The metadata block was not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new MetaFormatError('The metadata block was not an object.');
  }

  const obj = parsed as Record<string, unknown>;

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) throw new MetaFormatError('The metadata block had no summary.');

  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions = rawActions
    .filter((a): a is string => typeof a === 'string')
    .map((a) => a.trim())
    .filter(Boolean);

  if (expect.actions && actions.length !== 4) {
    throw new MetaFormatError(`Expected 4 actions, got ${actions.length}.`);
  }
  if (!expect.actions && actions.length !== 0) {
    // The final chapter must not offer choices; drop them rather than fail.
    actions.length = 0;
  }

  let achievement: ChapterMeta['achievement'] = null;
  if (obj.achievement && typeof obj.achievement === 'object') {
    const a = obj.achievement as Record<string, unknown>;
    const title = typeof a.title === 'string' ? a.title.trim() : '';
    const description = typeof a.description === 'string' ? a.description.trim() : '';
    // A malformed achievement is dropped, not fatal — the chapter is still good.
    if (title && description) achievement = { title, description };
  }

  const meta: ChapterMeta = { actions, achievement, summary };

  if (expect.title) {
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (!title) throw new MetaFormatError('The first chapter must come with a title.');
    meta.title = title;
  }

  return meta;
}
