import { LlmInvalidResponseError } from '../../domain/LlmProvider';
import type { LlmRequest } from '../../domain/LlmProvider';
import { fromGroqResponseBody, toGroqRequestBody } from './groq.mapper';

const OPTIONS = {
  model: 'openai/gpt-oss-120b',
  maxCompletionTokens: 1024,
  reasoningEffort: 'low' as const,
};

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    system: 'sos el asistente',
    messages: [{ role: 'user', content: 'hola' }],
    tools: [],
    ...overrides,
  };
}

describe('toGroqRequestBody', () => {
  it('puts the system prompt first and maps every message role', () => {
    const body = toGroqRequestBody(
      request({
        messages: [
          { role: 'user', content: '¿cuánto debo?' },
          {
            role: 'assistant',
            content: null,
            toolCalls: [
              { id: 'call_1', name: 'get_my_balance', argumentsJson: '{}' },
            ],
          },
          { role: 'tool', toolCallId: 'call_1', content: '{"data":1}' },
          { role: 'assistant', content: 'Debés Bs. 1' },
        ],
      }),
      OPTIONS,
    );

    expect(body.messages).toEqual([
      { role: 'system', content: 'sos el asistente' },
      { role: 'user', content: '¿cuánto debo?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_my_balance', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"data":1}' },
      { role: 'assistant', content: 'Debés Bs. 1' },
    ]);
  });

  it('sends model, reasoning effort and no reasoning output', () => {
    const body = toGroqRequestBody(request(), OPTIONS);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.include_reasoning).toBe(false);
    expect(body.max_completion_tokens).toBe(1024);
    expect(body.temperature).toBeLessThan(0.5);
  });

  it('lets the request override max completion tokens', () => {
    const body = toGroqRequestBody(
      request({ maxCompletionTokens: 200 }),
      OPTIONS,
    );
    expect(body.max_completion_tokens).toBe(200);
  });

  it('omits tools and tool_choice when there are no tools', () => {
    const body = toGroqRequestBody(request(), OPTIONS);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('maps tool definitions as functions with tool_choice auto', () => {
    const parameters = { type: 'object', properties: {} };
    const body = toGroqRequestBody(
      request({
        tools: [{ name: 'get_clinic_info', description: 'info', parameters }],
      }),
      OPTIONS,
    );
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: { name: 'get_clinic_info', description: 'info', parameters },
      },
    ]);
    expect(body.tool_choice).toBe('auto');
  });
});

describe('fromGroqResponseBody', () => {
  it('maps a text answer with usage', () => {
    expect(
      fromGroqResponseBody({
        choices: [
          {
            message: { role: 'assistant', content: 'Hola' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 8 },
      }),
    ).toEqual({
      content: 'Hola',
      toolCalls: [],
      usage: { promptTokens: 120, completionTokens: 8 },
      finishReason: 'stop',
    });
  });

  it('maps tool calls and keeps the arguments unparsed', () => {
    const response = fromGroqResponseBody({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'a',
                type: 'function',
                function: { name: 'get_faq', arguments: '{"topic":"pagos"}' },
              },
              {
                id: 'b',
                type: 'function',
                function: { name: 'list_doctors', arguments: '{}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    expect(response.content).toBeNull();
    expect(response.toolCalls).toEqual([
      { id: 'a', name: 'get_faq', argumentsJson: '{"topic":"pagos"}' },
      { id: 'b', name: 'list_doctors', argumentsJson: '{}' },
    ]);
    expect(response.finishReason).toBe('tool_calls');
    expect(response.usage).toBeNull();
  });

  it('serializes arguments that arrive already parsed, or missing', () => {
    const response = fromGroqResponseBody({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'a',
                function: { name: 'get_faq', arguments: { topic: 'x' } },
              },
              { id: 'b', function: { name: 'list_doctors' } },
            ],
          },
        },
      ],
    });
    expect(response.toolCalls.map((c) => c.argumentsJson)).toEqual([
      '{"topic":"x"}',
      '{}',
    ]);
  });

  it.each([
    ['length', 'length'],
    ['content_filter', 'other'],
    [undefined, 'other'],
  ])('maps finish_reason %p to %p', (raw, expected) => {
    const response = fromGroqResponseBody({
      choices: [{ message: { content: 'x' }, finish_reason: raw }],
    });
    expect(response.finishReason).toBe(expected);
  });

  it.each([
    ['null body', null],
    ['no choices', {}],
    ['empty choices', { choices: [] }],
    ['choice without message', { choices: [{}] }],
  ])('rejects a response with %s', (_label, body) => {
    expect(() => fromGroqResponseBody(body)).toThrow(LlmInvalidResponseError);
  });

  it.each([
    ['without id', { function: { name: 'get_faq', arguments: '{}' } }],
    ['without function', { id: 'a' }],
    [
      'with an empty name',
      { id: 'a', function: { name: '', arguments: '{}' } },
    ],
    ['that is not an object', 'get_faq'],
  ])('rejects a tool call %s', (_label, toolCall) => {
    expect(() =>
      fromGroqResponseBody({
        choices: [{ message: { tool_calls: [toolCall] } }],
      }),
    ).toThrow(LlmInvalidResponseError);
  });

  it('ignores usage with a wrong shape', () => {
    const response = fromGroqResponseBody({
      choices: [{ message: { content: 'x' } }],
      usage: { prompt_tokens: '10' },
    });
    expect(response.usage).toBeNull();
  });
});
