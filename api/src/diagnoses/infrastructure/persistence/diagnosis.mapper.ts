import type {
  diagnoses,
  diagnosis_categories,
  diagnosis_treatment_suggestions,
} from '@prisma/client';

type DiagnosisRecord = diagnoses & {
  diagnosis_treatment_suggestions?: Pick<
    diagnosis_treatment_suggestions,
    'treatment_id'
  >[];
};
import type { Diagnosis } from '../../domain/Diagnosis';
import type { DiagnosisCategory } from '../../domain/DiagnosisCategory';

export class DiagnosisMapper {
  static toDomain(record: DiagnosisRecord): Diagnosis {
    return {
      id: record.id,
      categoryId: record.category_id,
      code: record.code,
      name: record.name,
      scope: record.scope,
      modifier: record.modifier,
      color: record.color,
      displayOrder: record.display_order,
      suggestedTreatmentIds: (record.diagnosis_treatment_suggestions ?? []).map(
        (s) => s.treatment_id,
      ),
    };
  }

  static toDomainCategory(
    record: diagnosis_categories & { diagnoses: DiagnosisRecord[] },
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
