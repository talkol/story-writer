import { describeApiError, OPENAI_BASE } from './client';

/**
 * `gpt-5.5` rather than `gpt-5`, which is nine months older. Compared head to head on
 * the same Children's chapter-one prompt, the newer model followed the audience
 * constraints markedly better: average sentence 6.8 words against 11.3, chapter length
 * 6% over target against 13%, and no abstract similes of the kind the Children's rules
 * rule out. It was also faster and used roughly half the output tokens.
 */
export const TEXT_MODEL = 'gpt-5.5';

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
        /*
         * Measured on this exact prompt, time-to-first-token by effort:
         *   none 1.1s · low 1.8s · medium 1.9s · high 10.8s
         *
         * `high` is disqualified outright: six times the wait before any prose appears,
         * for a chapter the reader watches stream in. It also nearly doubles billed
         * output tokens, since reasoning tokens are charged.
         *
         * Between none, low and medium the prose differences were within noise. `medium`
         * is chosen because the request is not only prose — it must also return four
         * distinct actions and a coherent summary as valid JSON — and 60 reasoning
         * tokens is cheap insurance on the structured half for 0.1s of extra latency.
         */
        reasoning_effort: 'medium',
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
