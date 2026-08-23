import type { odontogram_entries } from '@prisma/client';
import type { OdontogramEntry } from '../../domain/OdontogramEntry';

export class OdontogramEntryMapper {
  static toDomain(record: odontogram_entries): OdontogramEntry {
    return {
      id: record.id,
      patientId: record.patient_id,
      toothNumber: record.tooth_number,
      toothType: record.tooth_type,
      toothCondition: record.tooth_condition,
      diagnosisDescription: record.diagnosis_description,
      xrayRequested: record.xray_requested,
      treatmentId: record.treatment_id ?? undefined,
      customPrice: record.custom_price
        ? Number(record.custom_price)
        : undefined,
      entryDate: record.entry_date,
      notes: record.notes ?? undefined,
      createdAt: record.created_at,
    };
  }
}
