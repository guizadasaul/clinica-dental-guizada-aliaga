import {
  LlmInvalidResponseError,
  LlmRateLimitedError,
  LlmUnavailableError,
} from './LlmProvider';

describe('LlmProvider domain errors', () => {
  it.each([
    [LlmUnavailableError, 'LlmUnavailableError'],
    [LlmRateLimitedError, 'LlmRateLimitedError'],
    [LlmInvalidResponseError, 'LlmInvalidResponseError'],
  ])('%p has its own name and a default message', (ErrorClass, name) => {
    const error = new ErrorClass();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.name).toBe(name);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('accepts a custom message', () => {
    expect(new LlmUnavailableError('timeout').message).toBe('timeout');
    expect(new LlmRateLimitedError('429').message).toBe('429');
    expect(new LlmInvalidResponseError('sin choices').message).toBe(
      'sin choices',
    );
  });
});
