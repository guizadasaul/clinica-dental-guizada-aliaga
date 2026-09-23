import { Prisma } from '@prisma/client';
import type { treatments, treatment_categories } from '@prisma/client';
import { TreatmentMapper } from './treatment.mapper';

function fakeCategory(
  overrides: Partial<treatment_categories> = {},
): treatment_categories {
  return {
    id: 'category-1',
    code: 'cirugia_oral',
    name: 'Cirugía oral',
    display_order: 4,
    color: '#9f1239',
    ...overrides,
  };
}

function fakeRecord(
  overrides: Partial<treatments> = {},
  categoryOverrides: Partial<treatment_categories> = {},
): treatments & { treatment_categories: treatment_categories } {
  return {
    id: 'treatment-1',
    code: 'implante_dental',
    name: 'Implante dental',
    description: null,
    base_price: new Prisma.Decimal(700),
    estimated_minutes: 60,
    application_type: 'single_tooth',
    currency: 'USD',
    category_id: 'category-1',
    display_order: 5,
    is_active: true,
    is_default_consultation: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    treatment_categories: fakeCategory(categoryOverrides),
    ...overrides,
  };
}

describe('TreatmentMapper', () => {
  it('converts base_price from Decimal to number', () => {
    const domain = TreatmentMapper.toDomain(fakeRecord());

    expect(domain.basePrice).toBe(700);
    expect(typeof domain.basePrice).toBe('number');
  });

  it('passes applicationType and currency through unchanged', () => {
    const domain = TreatmentMapper.toDomain(
      fakeRecord({ application_type: 'multiple_teeth', currency: 'BOB' }),
    );

    expect(domain.applicationType).toBe('multiple_teeth');
    expect(domain.currency).toBe('BOB');
  });

  it('flattens the category code, name and color onto the treatment', () => {
    const domain = TreatmentMapper.toDomain(
      fakeRecord(
        {},
        { code: 'ortodoncia', name: 'Ortodoncia', color: '#854d0e' },
      ),
    );

    expect(domain.categoryCode).toBe('ortodoncia');
    expect(domain.categoryName).toBe('Ortodoncia');
    expect(domain.categoryColor).toBe('#854d0e');
  });

  it('preserves a null description', () => {
    const domain = TreatmentMapper.toDomain(fakeRecord({ description: null }));

    expect(domain.description).toBeNull();
  });
});

describe('TreatmentMapper.toDomainCategory', () => {
  it('converts a treatment_categories record to domain', () => {
    const domain = TreatmentMapper.toDomainCategory(fakeCategory());

    expect(domain).toEqual({
      id: 'category-1',
      code: 'cirugia_oral',
      name: 'Cirugía oral',
      displayOrder: 4,
      color: '#9f1239',
    });
  });
});
