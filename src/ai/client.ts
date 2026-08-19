export const OPENAI_BASE = 'https://api.openai.com/v1';

export type KeyTestResult = { ok: boolean; message: string };

/**
 * Cheapest possible proof that a key works: list models. Costs nothing and requires no
 * model access beyond the key being valid, so the user finds out about a bad key or an
 * unfunded account before spending anything on a story.
 */
export async function testApiKey(key: string): Promise<KeyTestResult> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: 'Enter a key first.' };

  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
  } catch {
    // fetch rejects only on transport failure — offline, DNS, or a blocked request.
    return { ok: false, message: 'Could not reach api.openai.com. Check your connection.' };
  }

  if (res.ok) {
    const count = await res
      .json()
      .then((body: { data?: unknown[] }) => body.data?.length ?? 0)
      .catch(() => 0);
    return { ok: true, message: `Key works — ${count} models available.` };
  }

  return { ok: false, message: await describeApiError(res) };
}

/**
 * Shared status vocabulary. The story generator reuses this so every failure the user
 * can hit is phrased the same way and says what to do next.
 */
export async function describeApiError(res: Response): Promise<string> {
  const detail = await res
    .json()
    .then((body: { error?: { message?: string } }) => body.error?.message)
    .catch(() => undefined);

  switch (res.status) {
    case 401:
      return 'Key rejected. Check for a typo, or that the key has not been revoked.';
    case 403:
      return detail ?? 'This key is not permitted to use that resource.';
    case 429:
      // Rate limit and exhausted credit share a status but need different actions.
      return detail?.toLowerCase().includes('quota')
        ? 'This account is out of credit. Add billing at platform.openai.com.'
        : 'Rate limited. Wait a moment and try again.';
    case 500:
    case 502:
    case 503:
      return 'OpenAI is having trouble right now. Try again shortly.';
    default:
      return detail ?? `OpenAI returned ${res.status}.`;
  }
}
