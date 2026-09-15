import type {
  patients,
  medical_history,
  hygiene_habits,
  clinical_exams,
  users,
} from '@prisma/client';
import { Patient } from '../../domain/Patient';
import { MedicalHistory } from '../../domain/MedicalHistory';
import { HygieneHabits } from '../../domain/HygieneHabits';
import { ClinicalExam } from '../../domain/ClinicalExam';
import { PatientWithUser } from '../../domain/PatientWithUser';

export class PatientMapper {
  static toDomainPatient(r: patients): Patient {
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
      r.zona ?? null,
      r.ciudad ?? null,
      r.phone ?? null,
      r.emergency_contact_name ?? null,
      r.emergency_contact_phone ?? null,
      r.emergency_contact_relationship ?? null,
      r.consultation_reason ?? null,
      r.last_dentist_visit ?? null,
      r.last_visit_treatment ?? null,
      r.family_history ?? null,
      r.document_type ?? null,
      r.dni ?? null,
      r.created_at,
      r.updated_at,
    );
  }

  static toDomainMedicalHistory(r: medical_history): MedicalHistory {
    return new MedicalHistory(
      r.id,
      r.patient_id,
      r.has_allergies,
      r.kidney_problems,
      r.ulcers,
      r.rheumatism,
      r.heart_problems,
      r.diabetes,
      r.hypertension,
      r.hemorrhages,
      r.anemia,
      r.sti,
      r.other_diseases ?? null,
      r.gestation_period ?? null,
      r.anesthesia_reactions ?? null,
      r.current_medications ?? null,
      r.updated_at,
    );
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
      u.patients ? PatientMapper.toDomainPatient(u.patients) : null,
      u.patients?._count.dental_exams ?? 0,
      u.auth_user_id !== null,
    );
  }
}
