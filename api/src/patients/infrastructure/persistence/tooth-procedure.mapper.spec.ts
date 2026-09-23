import { Prisma } from '@prisma/client';
import { ToothProcedureMapper } from './tooth-procedure.mapper';

type Record = Parameters<typeof ToothProcedureMapper.toDomain>[0];

function fakeRecord(overrides: Partial<Record> = {}): Record {
  return {
    id: 'proc-1',
    patient_id: 'patient-1',
    tooth_number: 16,
    application_group_id: null,
    treatment_id: 'treatment-1',
    price_charged: new Prisma.Decimal(350),
    quantity: 1,
    procedure_date: new Date('2026-09-20T00:00:00Z'),
    notes: null,
    performed_by: 'doctor-1',
    created_at: new Date('2026-09-20T12:00:00Z'),
    tooth_procedure_surfaces: [],
    application_groups: null,
    treatments: {
      id: 'treatment-1',
      code: 'endodoncia_molar',
      name: 'Endodoncia molar',
      description: null,
      base_price: new Prisma.Decimal(350),
      estimated_minutes: 60,
      application_type: 'single_tooth',
      currency: 'BOB',
      category_id: 'category-endo',
      display_order: 0,
      is_active: true,
      is_default_consultation: false,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      treatment_categories: {
        id: 'category-endo',
        code: 'endodoncia',
        name: 'Endodoncia',
        display_order: 3,
        color: '#a21caf',
      },
    },
    ...overrides,
  };
}

describe('ToothProcedureMapper', () => {
  it('lleva el tipo de aplicación y la categoría (con su color) del tratamiento', () => {
    const domain = ToothProcedureMapper.toDomain(fakeRecord());

    expect(domain.applicationType).toBe('single_tooth');
    expect(domain.categoryCode).toBe('endodoncia');
    expect(domain.categoryName).toBe('Endodoncia');
    expect(domain.categoryColor).toBe('#a21caf');
  });

  it('usa el precio del grupo cuando la fila pertenece a un grupo', () => {
    const domain = ToothProcedureMapper.toDomain(
      fakeRecord({
        price_charged: null,
        application_group_id: 'group-1',
        application_groups: {
          id: 'group-1',
          unit_price: new Prisma.Decimal(500),
        } as Record['application_groups'],
      }),
    );

    expect(domain.priceCharged).toBe(500);
  });
});
