/** Raised when a write fails because the browser's storage quota is full. */
export class StorageFullError extends Error {
  constructor() {
    super('Storage full — export and remove an older story to free space.');
    this.name = 'StorageFullError';
  }
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  // Chrome/Safari/Firefox disagree on both name and legacy code.
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (isQuotaError(err)) throw new StorageFullError();
    throw err;
  }
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private-mode Safari and disabled-storage profiles throw on access.
    return null;
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}
