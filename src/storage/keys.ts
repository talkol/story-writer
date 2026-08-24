export const NS = 'story-app';
export const STORIES_KEY = `${NS}:stories`;
export const SETTINGS_KEY = `${NS}:settings`;
export const COVERS_DB = `${NS}-covers`;
export const COVERS_STORE = 'covers';

/** Bump when the persisted shape changes, and add a migration in migrations.ts. */
export const SCHEMA_VERSION = 3;
