import type { diagnoses, diagnosis_categories } from '@prisma/client';
import type { Diagnosis } from '../../domain/Diagnosis';
import type { DiagnosisCategory } from '../../domain/DiagnosisCategory';

export class DiagnosisMapper {
  static toDomain(record: diagnoses): Diagnosis {
    return {
      id: record.id,
      categoryId: record.category_id,
      code: record.code,
      name: record.name,
      scope: record.scope,
      modifier: record.modifier,
      color: record.color,
      displayOrder: record.display_order,
    };
  }

  static toDomainCategory(
    record: diagnosis_categories & { diagnoses: diagnoses[] },
  ): DiagnosisCategory {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      displayOrder: record.display_order,
      diagnoses: record.diagnoses.map((d) => DiagnosisMapper.toDomain(d)),
    };
  }
}
