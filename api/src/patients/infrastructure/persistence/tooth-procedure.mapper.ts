import type { tooth_procedures } from '@prisma/client';
import type { ToothProcedure } from '../../domain/ToothProcedure';

export class ToothProcedureMapper {
  static toDomain(record: tooth_procedures): ToothProcedure {
    return {
      id: record.id,
      patientId: record.patient_id,
      toothNumber: record.tooth_number,
      applicationGroupId: record.application_group_id,
      treatmentId: record.treatment_id,
      priceCharged: Number(record.price_charged),
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
