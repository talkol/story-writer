import { SCHEMA_VERSION } from './keys';

/**
 * Persisted envelope. The version lives on the envelope rather than on each record
 * so a migration can rewrite the whole collection in one pass.
 */
export interface Envelope<T> {
  schemaVersion: number;
  data: T;
}

/**
 * Migration chain. Index i upgrades version i -> i+1. Each takes and returns the raw
 * unknown payload; keep them total and defensive, since they run against data written
 * by older builds we can no longer see.
 */
type Migration = (data: unknown) => unknown;

const MIGRATIONS: Record<number, Migration> = {
  // 0 -> 1: nothing to do; v1 is the first shipped shape.

  // 1 -> 2: "part" became "chapter" throughout the domain model. Applies to the
  // stories collection; the settings payload has no affected fields and passes
  // through untouched.
  1: (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((story) => {
      if (typeof story !== 'object' || story === null) return story;
      const s = story as Record<string, unknown>;
      // Not a story record (settings, or something unexpected) — leave it alone.
      if (!('parts' in s) && !('totalParts' in s)) return story;

      const {
        parts,
        totalParts,
        genreChangedAtPart,
        readingPosition,
        achievements,
        ...rest
      } = s;

      const pos = (readingPosition ?? {}) as Record<string, unknown>;
      return {
        ...rest,
        chapters: parts ?? [],
        totalChapters: totalParts ?? 0,
        ...(genreChangedAtPart === undefined ? {} : { genreChangedAtChapter: genreChangedAtPart }),
        readingPosition: {
          chapterIndex: pos.partIndex ?? pos.chapterIndex ?? 0,
          wordOffset: pos.wordOffset ?? 0,
        },
        achievements: Array.isArray(achievements)
          ? achievements.map((a) => {
              if (typeof a !== 'object' || a === null) return a;
              const { unlockedAtPart, ...restA } = a as Record<string, unknown>;
              return unlockedAtPart === undefined
                ? a
                : { ...restA, unlockedAtChapter: unlockedAtPart };
            })
          : achievements,
      };
    });
  },

  // 2 -> 3: covers became a retryable job. Nothing to add to existing records — a
  // titled story with no cover and no job is treated as implicitly pending, which is
  // exactly what every pre-existing story is.
};

export function wrap<T>(data: T): Envelope<T> {
  return { schemaVersion: SCHEMA_VERSION, data };
}

/**
 * Like migrate(), but also reports whether the payload was written by an older
 * version. Callers use that to persist the upgraded shape immediately, so stored
 * data converges on the current schema instead of being re-migrated on every read.
 */
export function migrateWithMeta<T>(raw: string | null): { data: T | null; upgraded: boolean } {
  const startVersion = readVersion(raw);
  const data = migrate<T>(raw);
  return {
    data,
    upgraded: data !== null && startVersion !== null && startVersion < SCHEMA_VERSION,
  };
}

function readVersion(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const v = (parsed as Partial<Envelope<unknown>>).schemaVersion;
    return typeof v === 'number' ? v : 0;
  } catch {
    return null;
  }
}

/**
 * Reads an envelope written by any prior version and brings it up to current.
 * Returns null when the payload is unreadable, so callers can fall back to defaults
 * rather than crashing the app on corrupt storage.
 */
export function migrate<T>(raw: string | null): T | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[storage] unparseable payload, ignoring');
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const envelope = parsed as Partial<Envelope<unknown>>;
  let version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
  let data = 'data' in envelope ? envelope.data : parsed;

  if (version > SCHEMA_VERSION) {
    // Written by a newer build than this one. Refusing is safer than guessing.
    console.warn(`[storage] payload version ${version} is newer than ${SCHEMA_VERSION}`);
    return null;
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (step) data = step(data);
    version += 1;
  }

  return data as T;
}
