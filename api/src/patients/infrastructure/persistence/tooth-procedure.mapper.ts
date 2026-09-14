import type { tooth_procedures, application_groups } from '@prisma/client';
import type { ToothProcedure } from '../../domain/ToothProcedure';

type ToothProcedureRecordWithGroup = tooth_procedures & {
  application_groups: application_groups | null;
};

export class ToothProcedureMapper {
  // El precio de una fila agrupada (application_group_id NOT NULL) vive en
  // application_groups, no en la fila misma — CLI-53, mismo criterio que
  // QuoteMapper. Todas las filas de un mismo grupo reportan el mismo precio.
  static toDomain(record: ToothProcedureRecordWithGroup): ToothProcedure {
    const group = record.application_groups;
    return {
      id: record.id,
      patientId: record.patient_id,
      toothNumber: record.tooth_number,
      applicationGroupId: record.application_group_id,
      treatmentId: record.treatment_id,
      priceCharged: Number(group?.unit_price ?? record.price_charged ?? 0),
      quantity: record.quantity,
      procedureDate: record.procedure_date,
      surfaceVestibular: record.surface_vestibular,
      surfacePalatal: record.surface_palatal,
      surfaceMesial: record.surface_mesial,
      surfaceDistal: record.surface_distal,
      surfaceOcclusal: record.surface_occlusal,
      notes: record.notes ?? null,
      performedBy: record.performed_by,
      createdAt: record.created_at,
    };
  }
}
