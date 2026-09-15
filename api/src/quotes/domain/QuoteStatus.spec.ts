import { deriveQuoteStatus } from './QuoteStatus';

describe('deriveQuoteStatus', () => {
  it('is pending when nothing has been paid', () => {
    expect(deriveQuoteStatus(500, 0)).toBe('pending');
  });

  it('is partially_paid when paid is between 0 and the total', () => {
    expect(deriveQuoteStatus(500, 200)).toBe('partially_paid');
  });

  it('is paid when paid equals the total', () => {
    expect(deriveQuoteStatus(500, 500)).toBe('paid');
  });

  it('is paid when paid exceeds the total (overpayment)', () => {
    expect(deriveQuoteStatus(500, 600)).toBe('paid');
  });

  it('is partially_paid when total is 0 but something was paid', () => {
    expect(deriveQuoteStatus(0, 50)).toBe('partially_paid');
  });

  it('is pending when total and paid are both 0', () => {
    expect(deriveQuoteStatus(0, 0)).toBe('pending');
  });
});
