import { describeApiError, OPENAI_BASE } from './client';

export const TEXT_MODEL = 'gpt-5';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface StreamOptions {
  apiKey: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  /** Called with the full accumulated text each time more arrives. */
  onText: (accumulated: string) => void;
}

/**
 * Streams a chat completion and returns the full text.
 *
 * Parses the SSE frames by hand rather than pulling in the SDK, which exists mainly to
 * wrap this loop and would need `dangerouslyAllowBrowser` anyway.
 */
export async function streamCompletion({
  apiKey,
  messages,
  signal,
  onText,
}: StreamOptions): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages,
        stream: true,
        // gpt-5 is a reasoning model and time-to-first-token is dominated by
        // reasoning. Creative prose gains little from heavy deliberation here, and
        // the reader is staring at an empty page until the first token lands.
        reasoning_effort: 'low',
      }),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('Could not reach api.openai.com. Check your connection.');
  }

  if (!res.ok) throw new ApiError(await describeApiError(res), res.status);
  if (!res.body) throw new ApiError('The response had no body to stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return full;

      try {
        const frame = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = frame.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onText(full);
        }
      } catch {
        // A malformed frame is not worth failing the whole chapter over.
      }
    }
  }

  return full;
}
