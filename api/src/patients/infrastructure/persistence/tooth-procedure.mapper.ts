import type {
  tooth_procedures,
  tooth_procedure_surfaces,
  tooth_surfaces,
  application_groups,
  treatments,
  treatment_categories,
} from '@prisma/client';
import type { ToothProcedure } from '../../domain/ToothProcedure';
import type { ToothSurfaceCode } from '../../../shared/validators/tooth-surface.validator';

type ToothProcedureRecord = tooth_procedures & {
  tooth_procedure_surfaces: (tooth_procedure_surfaces & {
    tooth_surfaces: tooth_surfaces;
  })[];
  application_groups: application_groups | null;
  treatments: treatments & { treatment_categories: treatment_categories };
};

export class ToothProcedureMapper {
  // El precio de una fila agrupada (application_group_id NOT NULL) vive en
  // application_groups, no en la fila misma — CLI-53, mismo criterio que
  // QuoteMapper. Todas las filas de un mismo grupo reportan el mismo precio.
  static toDomain(record: ToothProcedureRecord): ToothProcedure {
    const group = record.application_groups;
    return {
      id: record.id,
      patientId: record.patient_id,
      toothNumber: record.tooth_number,
      applicationGroupId: record.application_group_id,
      treatmentId: record.treatment_id,
      applicationType: record.treatments.application_type,
      categoryCode: record.treatments.treatment_categories.code,
      categoryName: record.treatments.treatment_categories.name,
      categoryColor: record.treatments.treatment_categories.color,
      priceCharged: Number(group?.unit_price ?? record.price_charged ?? 0),
      quantity: record.quantity,
      procedureDate: record.procedure_date,
      surfaces: record.tooth_procedure_surfaces
        .toSorted(
          (a, b) =>
            a.tooth_surfaces.display_order - b.tooth_surfaces.display_order,
        )
        .map((tps) => tps.tooth_surfaces.code as ToothSurfaceCode),
      notes: record.notes ?? null,
      performedBy: record.performed_by,
      createdAt: record.created_at,
    };
  }
}
