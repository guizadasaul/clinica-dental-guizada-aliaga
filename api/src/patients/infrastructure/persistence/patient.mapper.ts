import type {
  patients,
  medical_history,
  patient_medical_conditions,
  medical_conditions,
  patient_medications,
  hygiene_habits,
  clinical_exams,
  users,
} from '@prisma/client';
import { Patient } from '../../domain/Patient';
import type { MedicalHistory } from '../../domain/MedicalHistory';
import { HygieneHabits } from '../../domain/HygieneHabits';
import { ClinicalExam } from '../../domain/ClinicalExam';
import { PatientWithUser } from '../../domain/PatientWithUser';
import { gestationTrimesterFor } from '../../domain/gestation.util';

type MedicalHistoryRecord = medical_history & {
  patient_medical_conditions: (patient_medical_conditions & {
    medical_conditions: medical_conditions;
  })[];
  patient_medications: patient_medications[];
};

type PatientRecordWithUser = patients & { users: { phone: string | null } };

export class PatientMapper {
  // El teléfono vive en users.phone (CLI-51), no en patients — patients.user_id
  // es 1:1, así que la relación siempre existe.
  static toDomainPatient(r: PatientRecordWithUser): Patient {
    return new Patient(
      r.id,
      r.user_id,
      r.first_name,
      r.last_name_paternal,
      r.last_name_maternal ?? null,
      r.birth_date ?? null,
      r.birth_place ?? null,
      r.sex ?? null,
      r.occupation ?? null,
      r.address ?? null,
      r.users.phone ?? null,
      r.emergency_contact_name ?? null,
      r.emergency_contact_phone ?? null,
      r.emergency_contact_relationship ?? null,
      r.consultation_reason ?? null,
      r.last_dentist_visit ?? null,
      r.last_visit_treatment ?? null,
      r.family_history ?? null,
      r.dni ?? null,
      r.created_at,
      r.updated_at,
    );
  }

  static toDomainMedicalHistory(r: MedicalHistoryRecord): MedicalHistory {
    return {
      id: r.id,
      patientId: r.patient_id,
      conditions: r.patient_medical_conditions.map((pmc) => ({
        code: pmc.medical_conditions.code,
        name: pmc.medical_conditions.name,
        diagnosedAt: pmc.diagnosed_at ?? null,
        notes: pmc.notes ?? null,
      })),
      otherDiseases: r.other_diseases ?? null,
      gestationLmpDate: r.gestation_lmp_date ?? null,
      gestationTrimester: r.gestation_lmp_date
        ? gestationTrimesterFor(r.gestation_lmp_date)
        : null,
      anesthesiaReactions: r.anesthesia_reactions ?? null,
      medications: r.patient_medications.map((m) => ({
        id: m.id,
        drugName: m.drug_name,
        dose: m.dose ?? null,
        frequency: m.frequency ?? null,
        startedAt: m.started_at ?? null,
      })),
      updatedAt: r.updated_at,
    };
  }

  static toDomainHygieneHabits(r: hygiene_habits): HygieneHabits {
    return new HygieneHabits(
      r.id,
      r.patient_id,
      r.uses_toothbrush,
      r.brushing_frequency ?? null,
      r.uses_dental_floss,
      r.uses_toothpick,
      r.brushes_tongue,
      r.uses_mouthwash,
      r.updated_at,
    );
  }

  static toDomainClinicalExam(r: clinical_exams): ClinicalExam {
    return new ClinicalExam(
      r.id,
      r.patient_id,
      r.tartar,
      r.saburra,
      r.bacterial_plaque,
      r.halitosis,
      r.occlusion ?? null,
      r.exam_date,
      r.created_at,
    );
  }

  static toDomainPatientWithUser(
    u: users & {
      patients: (patients & { _count: { dental_exams: number } }) | null;
    },
  ): PatientWithUser {
    return new PatientWithUser(
      u.id,
      u.display_name ?? null,
      u.email ?? null,
      u.phone ?? null,
      u.created_at,
      u.patients
        ? PatientMapper.toDomainPatient({ ...u.patients, users: u })
        : null,
      u.patients?._count.dental_exams ?? 0,
      u.auth_user_id !== null,
    );
  }
}
