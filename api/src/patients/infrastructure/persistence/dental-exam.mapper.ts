import type {
  dental_exams,
  dental_exam_findings,
  diagnoses,
  diagnosis_categories,
  users,
} from '@prisma/client';
import type {
  DentalExam,
  DentalExamVersionSummary,
} from '../../domain/DentalExam';
import type { DentalExamFinding } from '../../domain/DentalExamFinding';

type FindingRecord = dental_exam_findings & {
  diagnoses: diagnoses & { diagnosis_categories: diagnosis_categories };
};

type ExamRecord = dental_exams & {
  users: users;
  dental_exam_findings: FindingRecord[];
};

type ExamSummaryRecord = dental_exams & {
  users: users;
  _count: { dental_exam_findings: number };
};

export class DentalExamMapper {
  static toDomainFinding(record: FindingRecord): DentalExamFinding {
    return {
      id: record.id,
      diagnosisId: record.diagnosis_id,
      diagnosisCode: record.diagnoses.code,
      diagnosisName: record.diagnoses.name,
      diagnosisScope: record.diagnoses.scope,
      diagnosisColor: record.diagnoses.color,
      categoryName: record.diagnoses.diagnosis_categories.name,
      toothNumber: record.tooth_number,
      toothType: record.tooth_type,
      applicationGroupId: record.application_group_id,
      modifierValue: record.modifier_value,
      description: record.description,
      xrayRequested: record.xray_requested,
      notes: record.notes,
    };
  }

  static toDomain(record: ExamRecord): DentalExam {
    return {
      id: record.id,
      patientId: record.patient_id,
      version: record.version,
      kind: record.kind,
      recordedBy: record.recorded_by,
      recordedByName: record.users.display_name ?? null,
      recordedAt: record.recorded_at,
      changeReason: record.change_reason,
      notes: record.notes,
      findings: record.dental_exam_findings.map((f) =>
        DentalExamMapper.toDomainFinding(f),
      ),
    };
  }

  static toVersionSummary(record: ExamSummaryRecord): DentalExamVersionSummary {
    return {
      id: record.id,
      version: record.version,
      kind: record.kind,
      recordedBy: record.recorded_by,
      recordedByName: record.users.display_name ?? null,
      recordedAt: record.recorded_at,
      changeReason: record.change_reason,
      findingsCount: record._count.dental_exam_findings,
    };
  }
}
