import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('usa el x-request-id del cliente si tiene forma de id', () => {
    expect(resolveRequestId('req_abc-12345')).toBe('req_abc-12345');
    expect(resolveRequestId(['req_abc-12345', 'otro-id-123'])).toBe(
      'req_abc-12345',
    );
  });

  it.each([
    undefined,
    '',
    'corto',
    'con espacios 123',
    'x'.repeat(65),
    'a\nb-12345678',
  ])('genera uno nuevo si falta o no es válido (%p)', (header) => {
    expect(resolveRequestId(header)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
