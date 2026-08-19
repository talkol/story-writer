import type { FontScale, Settings } from '../types';
import { SETTINGS_KEY } from './keys';
import { migrateWithMeta, wrap } from './migrations';
import { readLocal, writeLocal } from './quota';

const DEFAULTS: Settings = { apiKey: null, fontScale: 1 };

export function loadSettings(): Settings {
  const { data, upgraded } = migrateWithMeta<Partial<Settings>>(readLocal(SETTINGS_KEY));
  if (!data) return { ...DEFAULTS };

  const settings: Settings = {
    apiKey: typeof data.apiKey === 'string' && data.apiKey ? data.apiKey : null,
    fontScale: (data.fontScale ?? DEFAULTS.fontScale) as FontScale,
  };

  // Converge stored settings on the current schema, same as the story collection.
  if (upgraded) {
    try {
      saveSettings(settings);
    } catch {
      /* in-memory value is correct; a failed write is not worth surfacing here */
    }
  }

  return settings;
}

export function saveSettings(settings: Settings): void {
  writeLocal(SETTINGS_KEY, JSON.stringify(wrap(settings)));
}

export function hasApiKey(): boolean {
  return Boolean(loadSettings().apiKey);
}
