import { Prisma } from '@prisma/client';
import type { treatments } from '@prisma/client';
import { TreatmentMapper } from './treatment.mapper';

function fakeRecord(overrides: Partial<treatments> = {}): treatments {
  return {
    id: 'treatment-1',
    name: 'Implante',
    description: null,
    base_price: new Prisma.Decimal(700),
    estimated_minutes: 60,
    scope: 'tooth',
    currency: 'USD',
    is_active: true,
    is_default_consultation: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('TreatmentMapper', () => {
  it('converts base_price from Decimal to number', () => {
    const domain = TreatmentMapper.toDomain(fakeRecord());

    expect(domain.basePrice).toBe(700);
    expect(typeof domain.basePrice).toBe('number');
  });

  it('passes scope and currency through unchanged', () => {
    const domain = TreatmentMapper.toDomain(
      fakeRecord({ scope: 'multi_tooth', currency: 'BOB' }),
    );

    expect(domain.scope).toBe('multi_tooth');
    expect(domain.currency).toBe('BOB');
  });

  it('preserves a null description', () => {
    const domain = TreatmentMapper.toDomain(fakeRecord({ description: null }));

    expect(domain.description).toBeNull();
  });
});
