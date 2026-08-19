import { COVERS_DB, COVERS_STORE } from './keys';
import { StorageFullError } from './quota';

/**
 * Cover images live in IndexedDB as Blobs, never in localStorage. A raw 1024x1536
 * image from the API is 1-2 MB as base64, which exhausts the ~5 MB localStorage
 * quota after two or three books. See SPEC.md §3.
 */

const COVER_WIDTH = 512;
const COVER_HEIGHT = 768;
const COVER_QUALITY = 0.75;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(COVERS_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(COVERS_STORE)) {
        db.createObjectStore(COVERS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(COVERS_STORE, mode);
        const req = run(transaction.objectStore(COVERS_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          const err = req.error;
          reject(err?.name === 'QuotaExceededError' ? new StorageFullError() : err);
        };
      }),
  );
}

export function putCover(id: string, blob: Blob): Promise<void> {
  return tx('readwrite', (store) => store.put(blob, id)).then(() => undefined);
}

export function getCover(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (store) => store.get(id));
}

export function deleteCover(id: string): Promise<void> {
  return tx('readwrite', (store) => store.delete(id)).then(() => undefined);
}

/**
 * Downscales an image to cover dimensions and re-encodes as JPEG (~50 KB) before it
 * ever reaches storage. Accepts anything createImageBitmap can decode.
 */
export async function normalizeCover(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  // Cover-fit: fill the 2:3 frame, cropping the overflowing axis.
  const scale = Math.max(COVER_WIDTH / bitmap.width, COVER_HEIGHT / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (COVER_WIDTH - w) / 2, (COVER_HEIGHT - h) / 2, w, h);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('cover encode failed'))),
      'image/jpeg',
      COVER_QUALITY,
    );
  });
}
