import { Logger } from '@nestjs/common';
import {
  LlmInvalidResponseError,
  LlmRateLimitedError,
  LlmUnavailableError,
} from '../../domain/LlmProvider';
import type { LlmRequest } from '../../domain/LlmProvider';
import { GroqLlmProvider } from './groq-llm.provider';

const API_KEY = 'gsk_test_secret_key_123';

const REQUEST: LlmRequest = {
  system: 'sistema',
  messages: [{ role: 'user', content: 'hola' }],
  tools: [],
};

function okBody(message: object) {
  return {
    choices: [{ message, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Sin esperas reales entre reintentos; registra los delays pedidos. */
class TestableGroqLlmProvider extends GroqLlmProvider {
  readonly waits: number[] = [];
  protected override wait(ms: number): Promise<void> {
    this.waits.push(ms);
    return Promise.resolve();
  }
}

describe('GroqLlmProvider', () => {
  const originalEnv = process.env;
  let fetchMock: jest.Mock;
  let provider: TestableGroqLlmProvider;
  let logged: string[];

  beforeEach(() => {
    process.env = { ...originalEnv, GROQ_API_KEY: API_KEY };
    delete process.env['GROQ_MODEL'];
    delete process.env['GROQ_BASE_URL'];
    delete process.env['GROQ_TIMEOUT_MS'];
    delete process.env['GROQ_MAX_COMPLETION_TOKENS'];
    delete process.env['GROQ_REASONING_EFFORT'];
    fetchMock = jest.fn();
    // Cada llamada recibe un clon: un mismo Response mockeado se puede leer
    // en el reintento (el body de un Response solo se consume una vez).
    global.fetch = async (...args: unknown[]) => {
      const response = (await fetchMock(...args)) as Response;
      return response.clone();
    };
    provider = new TestableGroqLlmProvider();
    logged = [];
    const capture = (message: unknown) => {
      logged.push(String(message));
    };
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function fetchCall(call = 0): [string, RequestInit] {
    return fetchMock.mock.calls[call] as [string, RequestInit];
  }

  function sentBody(call = 0): Record<string, unknown> {
    const init = fetchCall(call)[1];
    return JSON.parse(init.body as string) as Record<string, unknown>;
  }

  it('can be constructed without GROQ_API_KEY (the app still boots)', () => {
    delete process.env['GROQ_API_KEY'];
    expect(() => new GroqLlmProvider()).not.toThrow();
  });

  it('rejects with LlmUnavailableError and never calls Groq when the key is missing', async () => {
    delete process.env['GROQ_API_KEY'];
    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a text answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, okBody({ content: 'Hola' })));

    const response = await provider.chat(REQUEST);

    expect(response.content).toBe('Hola');
    expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 2 });
  });

  it('returns tool calls', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        200,
        okBody({
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'get_clinic_info', arguments: '{}' },
            },
          ],
        }),
      ),
    );

    const response = await provider.chat(REQUEST);

    expect(response.toolCalls).toEqual([
      { id: 'c1', name: 'get_clinic_info', argumentsJson: '{}' },
    ]);
  });

  it('posts to the default endpoint with the bearer key and the default model', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, okBody({ content: 'x' })));

    await provider.chat(REQUEST);

    const [url, init] = fetchCall();
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(sentBody()).toMatchObject({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 1024,
      reasoning_effort: 'low',
      include_reasoning: false,
    });
  });

  it('reads model, base URL, tokens and reasoning effort from env', async () => {
    process.env['GROQ_MODEL'] = 'openai/gpt-oss-20b';
    process.env['GROQ_BASE_URL'] = 'http://localhost:11434/v1/';
    process.env['GROQ_MAX_COMPLETION_TOKENS'] = '300';
    process.env['GROQ_REASONING_EFFORT'] = 'medium';
    fetchMock.mockResolvedValue(jsonResponse(200, okBody({ content: 'x' })));

    await provider.chat(REQUEST);

    expect(fetchCall()[0]).toBe('http://localhost:11434/v1/chat/completions');
    expect(sentBody()).toMatchObject({
      model: 'openai/gpt-oss-20b',
      max_completion_tokens: 300,
      reasoning_effort: 'medium',
    });
  });

  it('falls back to low reasoning effort for an invalid value', async () => {
    process.env['GROQ_REASONING_EFFORT'] = 'extreme';
    fetchMock.mockResolvedValue(jsonResponse(200, okBody({ content: 'x' })));

    await provider.chat(REQUEST);

    expect(sentBody().reasoning_effort).toBe('low');
  });

  it('maps a timeout to LlmUnavailableError without retrying', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a network failure that is not an Error to LlmUnavailableError', async () => {
    fetchMock.mockRejectedValue('socket hang up');

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(logged.join('\n')).toContain('timeout o error de red');
  });

  it('propagates a non-retryable failure of the second attempt as is', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once after a 429 and succeeds, honoring retry-after', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          429,
          { error: { code: 'rate_limit_exceeded' } },
          { 'retry-after': '2' },
        ),
      )
      .mockResolvedValueOnce(jsonResponse(200, okBody({ content: 'ok' })));

    const response = await provider.chat(REQUEST);

    expect(response.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.waits).toEqual([2000]);
  });

  it('waits for real between attempts when not stubbed', async () => {
    jest.useFakeTimers();
    try {
      const realProvider = new GroqLlmProvider();
      fetchMock
        .mockResolvedValueOnce(new Response('down', { status: 502 }))
        .mockResolvedValueOnce(jsonResponse(200, okBody({ content: 'ok' })));

      const pending = realProvider.chat(REQUEST);
      await jest.advanceTimersByTimeAsync(500);

      await expect(pending).resolves.toMatchObject({ content: 'ok' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps a long retry-after', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '60' }))
      .mockResolvedValueOnce(jsonResponse(200, okBody({ content: 'ok' })));

    await provider.chat(REQUEST);

    expect(provider.waits).toEqual([3000]);
  });

  it('throws LlmRateLimitedError after two 429 in a row', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, {}));

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmRateLimitedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.waits).toEqual([500]);
  });

  it('retries a 5xx once and then throws LlmUnavailableError', async () => {
    fetchMock.mockResolvedValue(
      new Response('upstream error', { status: 503 }),
    );

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a tool_use_failed once immediately', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(400, { error: { code: 'tool_use_failed', message: 'x' } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, okBody({ content: 'ok' })));

    const response = await provider.chat(REQUEST);

    expect(response.content).toBe('ok');
    expect(provider.waits).toEqual([0]);
  });

  it('throws LlmInvalidResponseError if tool_use_failed repeats', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { code: 'tool_use_failed' } }),
    );

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmInvalidResponseError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404])(
    'does not retry a %d and maps it to LlmUnavailableError',
    async (status) => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, { error: { code: 'invalid_api_key' } }),
      );

      await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
        LlmUnavailableError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('maps a 200 with a non-JSON body to LlmInvalidResponseError', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmInvalidResponseError,
    );
  });

  it('maps a 200 with a malformed body to LlmInvalidResponseError', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { choices: [] }));

    await expect(provider.chat(REQUEST)).rejects.toBeInstanceOf(
      LlmInvalidResponseError,
    );
  });

  it('never leaks the API key or the provider error body in errors or logs', async () => {
    const secretInBody = 'prompt del paciente con DNI 1234567';
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        error: {
          code: 'invalid_api_key',
          message: `${secretInBody} ${API_KEY}`,
        },
      }),
    );

    const error = (await provider
      .chat(REQUEST)
      .catch((e: unknown) => e)) as Error;

    expect(error.message).not.toContain(API_KEY);
    expect(error.message).not.toContain(secretInBody);
    expect(logged.join('\n')).not.toContain(API_KEY);
    expect(logged.join('\n')).not.toContain(secretInBody);
    expect(logged.join('\n')).toContain('HTTP 401 (invalid_api_key)');
  });
});
