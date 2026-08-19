import type { FontScale, Settings } from '../types';
import { SETTINGS_KEY } from './keys';
import { migrate, wrap } from './migrations';
import { readLocal, writeLocal } from './quota';

const DEFAULTS: Settings = { apiKey: null, fontScale: 1 };

export function loadSettings(): Settings {
  const stored = migrate<Partial<Settings>>(readLocal(SETTINGS_KEY));
  if (!stored) return { ...DEFAULTS };
  return {
    apiKey: typeof stored.apiKey === 'string' && stored.apiKey ? stored.apiKey : null,
    fontScale: (stored.fontScale ?? DEFAULTS.fontScale) as FontScale,
  };
}

export function saveSettings(settings: Settings): void {
  writeLocal(SETTINGS_KEY, JSON.stringify(wrap(settings)));
}

export function hasApiKey(): boolean {
  return Boolean(loadSettings().apiKey);
}
