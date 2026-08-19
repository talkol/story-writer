import { useEffect, useState } from 'react';
import { getCover } from './covers.idb';

/**
 * Resolves a cover id to an object URL, revoking it on unmount or id change.
 * Returns null while loading and when the story has no cover, so callers render the
 * placeholder in both cases.
 */
export function useCoverUrl(coverImageId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!coverImageId) {
      setUrl(null);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    getCover(coverImageId)
      .then((blob) => {
        if (revoked || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [coverImageId]);

  return url;
}
