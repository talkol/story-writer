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
  // Example of the shape future entries take:
  // 1: (data) => ({ ...(data as object), newField: defaultValue }),
};

export function wrap<T>(data: T): Envelope<T> {
  return { schemaVersion: SCHEMA_VERSION, data };
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
