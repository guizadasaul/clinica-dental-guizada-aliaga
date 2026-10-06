import { formatBs } from './money.util';

describe('formatBs', () => {
  it('usa el formato boliviano con dos decimales', () => {
    expect(formatBs(1250)).toBe('Bs. 1.250,00');
    expect(formatBs(0.5)).toBe('Bs. 0,50');
  });
});
