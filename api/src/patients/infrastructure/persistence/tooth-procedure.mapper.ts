import type {
  tooth_procedures,
  tooth_procedure_surfaces,
  tooth_surfaces,
} from '@prisma/client';
import type { ToothProcedure } from '../../domain/ToothProcedure';
import type { ToothSurfaceCode } from '../../../shared/validators/tooth-surface.validator';

type ToothProcedureRecord = tooth_procedures & {
  tooth_procedure_surfaces: (tooth_procedure_surfaces & {
    tooth_surfaces: tooth_surfaces;
  })[];
};

export class ToothProcedureMapper {
  static toDomain(record: ToothProcedureRecord): ToothProcedure {
    return {
      id: record.id,
      patientId: record.patient_id,
      toothNumber: record.tooth_number,
      applicationGroupId: record.application_group_id,
      treatmentId: record.treatment_id,
      priceCharged: Number(record.price_charged),
      quantity: record.quantity,
      procedureDate: record.procedure_date,
      surfaces: record.tooth_procedure_surfaces
        .sort((a, b) => a.tooth_surfaces.display_order - b.tooth_surfaces.display_order)
        .map((tps) => tps.tooth_surfaces.code as ToothSurfaceCode),
      notes: record.notes ?? null,
      performedBy: record.performed_by,
      createdAt: record.created_at,
    };
  }
}
