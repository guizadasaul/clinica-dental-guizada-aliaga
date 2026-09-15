import type { medical_conditions } from '@prisma/client';
import type { MedicalCondition } from '../../domain/MedicalCondition';

export class MedicalConditionMapper {
  static toDomain(record: medical_conditions): MedicalCondition {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      displayOrder: record.display_order,
    };
  }
}
