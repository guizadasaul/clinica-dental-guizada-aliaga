import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  IPatientRepository,
  CreatePatientData,
  UpdatePatientData,
  MedicalHistoryData,
  HygieneHabitsData,
  ClinicalExamData,
  OdontogramEntryData,
  CreateToothProcedureData,
  CreateDentalExamData,
} from '../../domain/PatientRepository';
import type { Patient } from '../../domain/Patient';
import type { MedicalHistory } from '../../domain/MedicalHistory';
import type { HygieneHabits } from '../../domain/HygieneHabits';
import type { ClinicalExam } from '../../domain/ClinicalExam';
import type { PatientWithUser } from '../../domain/PatientWithUser';
import type { OdontogramEntry } from '../../domain/OdontogramEntry';
import type { ToothProcedure } from '../../domain/ToothProcedure';
import type {
  DentalExam,
  DentalExamVersionSummary,
} from '../../domain/DentalExam';
import { PatientMapper } from './patient.mapper';
import { OdontogramEntryMapper } from './odontogram-entry.mapper';
import { ToothProcedureMapper } from './tooth-procedure.mapper';
import { DentalExamMapper } from './dental-exam.mapper';

const DENTAL_EXAM_INCLUDE = {
  users: true,
  dental_exam_findings: {
    include: { diagnoses: { include: { diagnosis_categories: true } } },
  },
} as const;

/**
 * Fecha de hoy sin componente horario, para columnas `@db.Date` (exam_date,
 * entry_date, birth_date). Igual que como se construyen esos valores en el
 * resto de la app a partir de un string ISO "yyyy-mm-dd" (`new Date(iso)`).
 */
function todayDateOnly(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

@Injectable()
export class PrismaPatientsRepository implements IPatientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithUsers(): Promise<PatientWithUser[]> {
    const records = await this.prisma.users.findMany({
      where: { role: 'patient' },
      include: {
        patients: {
          include: {
            _count: { select: { dental_exams: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return records.map((u) => PatientMapper.toDomainPatientWithUser(u));
  }

  async findPatientById(id: string): Promise<Patient | null> {
    const record = await this.prisma.patients.findUnique({ where: { id } });
    return record ? PatientMapper.toDomainPatient(record) : null;
  }

  async findByUserId(userId: string): Promise<Patient | null> {
    const record = await this.prisma.patients.findUnique({
      where: { user_id: userId },
    });
    return record ? PatientMapper.toDomainPatient(record) : null;
  }

  async create(userId: string, data: CreatePatientData): Promise<Patient> {
    const record = await this.prisma.patients.create({
      data: {
        user_id: userId,
        first_name: data.firstName,
        last_name_paternal: data.lastNamePaternal,
        last_name_maternal: data.lastNameMaternal ?? null,
        birth_date: data.birthDate,
        birth_place: data.birthPlace ?? null,
        sex: data.sex ?? null,
        occupation: data.occupation ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        emergency_contact_name: data.emergencyContactName ?? null,
        emergency_contact_phone: data.emergencyContactPhone ?? null,
        emergency_contact_relationship:
          data.emergencyContactRelationship ?? null,
        consultation_reason: data.consultationReason ?? null,
        last_dentist_visit: data.lastDentistVisit ?? null,
        last_visit_treatment: data.lastVisitTreatment ?? null,
        family_history: data.familyHistory ?? null,
        dni: data.dni ?? null,
      },
    });
    return PatientMapper.toDomainPatient(record);
  }

  async updatePatient(
    id: string,
    data: UpdatePatientData,
  ): Promise<Patient | null> {
    try {
      const record = await this.prisma.patients.update({
        where: { id },
        data: {
          ...(data.firstName !== undefined && { first_name: data.firstName }),
          ...(data.lastNamePaternal !== undefined && {
            last_name_paternal: data.lastNamePaternal,
          }),
          ...(data.lastNameMaternal !== undefined && {
            last_name_maternal: data.lastNameMaternal,
          }),
          ...(data.birthDate !== undefined && { birth_date: data.birthDate }),
          ...(data.birthPlace !== undefined && {
            birth_place: data.birthPlace,
          }),
          ...(data.sex !== undefined && { sex: data.sex }),
          ...(data.occupation !== undefined && { occupation: data.occupation }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.emergencyContactName !== undefined && {
            emergency_contact_name: data.emergencyContactName,
          }),
          ...(data.emergencyContactPhone !== undefined && {
            emergency_contact_phone: data.emergencyContactPhone,
          }),
          ...(data.emergencyContactRelationship !== undefined && {
            emergency_contact_relationship: data.emergencyContactRelationship,
          }),
          ...(data.consultationReason !== undefined && {
            consultation_reason: data.consultationReason,
          }),
          ...(data.lastDentistVisit !== undefined && {
            last_dentist_visit: data.lastDentistVisit,
          }),
          ...(data.lastVisitTreatment !== undefined && {
            last_visit_treatment: data.lastVisitTreatment,
          }),
          ...(data.familyHistory !== undefined && {
            family_history: data.familyHistory,
          }),
          ...(data.dni !== undefined && { dni: data.dni }),
          updated_at: new Date(),
        },
      });
      return PatientMapper.toDomainPatient(record);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }

  async upsertMedicalHistory(
    patientId: string,
    data: MedicalHistoryData,
  ): Promise<MedicalHistory> {
    const record = await this.prisma.medical_history.upsert({
      where: { patient_id: patientId },
      create: {
        patient_id: patientId,
        has_allergies: data.hasAllergies ?? false,
        kidney_problems: data.kidneyProblems ?? false,
        ulcers: data.ulcers ?? false,
        rheumatism: data.rheumatism ?? false,
        heart_problems: data.heartProblems ?? false,
        diabetes: data.diabetes ?? false,
        hypertension: data.hypertension ?? false,
        hemorrhages: data.hemorrhages ?? false,
        anemia: data.anemia ?? false,
        sti: data.sti ?? false,
        other_diseases: data.otherDiseases ?? null,
        gestation_period: data.gestationPeriod ?? null,
        anesthesia_reactions: data.anesthesiaReactions ?? null,
        current_medications: data.currentMedications ?? null,
        updated_at: new Date(),
      },
      update: {
        has_allergies: data.hasAllergies ?? false,
        kidney_problems: data.kidneyProblems ?? false,
        ulcers: data.ulcers ?? false,
        rheumatism: data.rheumatism ?? false,
        heart_problems: data.heartProblems ?? false,
        diabetes: data.diabetes ?? false,
        hypertension: data.hypertension ?? false,
        hemorrhages: data.hemorrhages ?? false,
        anemia: data.anemia ?? false,
        sti: data.sti ?? false,
        other_diseases: data.otherDiseases ?? null,
        gestation_period: data.gestationPeriod ?? null,
        anesthesia_reactions: data.anesthesiaReactions ?? null,
        current_medications: data.currentMedications ?? null,
        updated_at: new Date(),
      },
    });
    return PatientMapper.toDomainMedicalHistory(record);
  }

  async findMedicalHistory(patientId: string): Promise<MedicalHistory | null> {
    const record = await this.prisma.medical_history.findUnique({
      where: { patient_id: patientId },
    });
    return record ? PatientMapper.toDomainMedicalHistory(record) : null;
  }

  async upsertHygieneHabits(
    patientId: string,
    data: HygieneHabitsData,
  ): Promise<HygieneHabits> {
    const record = await this.prisma.hygiene_habits.upsert({
      where: { patient_id: patientId },
      create: {
        patient_id: patientId,
        uses_toothbrush: data.usesToothbrush ?? false,
        brushing_frequency: data.brushingFrequency ?? null,
        uses_dental_floss: data.usesDentalFloss ?? false,
        uses_toothpick: data.usesToothpick ?? false,
        brushes_tongue: data.brushesTongue ?? false,
        uses_mouthwash: data.usesMouthwash ?? false,
        updated_at: new Date(),
      },
      update: {
        uses_toothbrush: data.usesToothbrush ?? false,
        brushing_frequency: data.brushingFrequency ?? null,
        uses_dental_floss: data.usesDentalFloss ?? false,
        uses_toothpick: data.usesToothpick ?? false,
        brushes_tongue: data.brushesTongue ?? false,
        uses_mouthwash: data.usesMouthwash ?? false,
        updated_at: new Date(),
      },
    });
    return PatientMapper.toDomainHygieneHabits(record);
  }

  async findHygieneHabits(patientId: string): Promise<HygieneHabits | null> {
    const record = await this.prisma.hygiene_habits.findUnique({
      where: { patient_id: patientId },
    });
    return record ? PatientMapper.toDomainHygieneHabits(record) : null;
  }

  /**
   * Upsert por (patient_id, exam_date) — reenviar el paso 4 el mismo día
   * actualiza el examen de hoy en vez de duplicarlo; el histórico entre días
   * se preserva. Requiere el índice único agregado en la migración CLI-39.
   */
  async createClinicalExam(
    patientId: string,
    data: ClinicalExamData,
  ): Promise<ClinicalExam> {
    const examDate = todayDateOnly();
    const fields = {
      tartar: data.tartar ?? false,
      saburra: data.saburra ?? false,
      bacterial_plaque: data.bacterialPlaque ?? false,
      halitosis: data.halitosis ?? false,
      occlusion: data.occlusion ?? null,
    };
    const record = await this.prisma.clinical_exams.upsert({
      where: {
        patient_id_exam_date: { patient_id: patientId, exam_date: examDate },
      },
      create: { patient_id: patientId, exam_date: examDate, ...fields },
      update: fields,
    });
    return PatientMapper.toDomainClinicalExam(record);
  }

  async findLatestClinicalExam(
    patientId: string,
  ): Promise<ClinicalExam | null> {
    const record = await this.prisma.clinical_exams.findFirst({
      where: { patient_id: patientId },
      orderBy: { exam_date: 'desc' },
    });
    return record ? PatientMapper.toDomainClinicalExam(record) : null;
  }

  /**
   * Reemplazo transaccional, acotado a las entries del chart
   * (`treatment_id IS NULL`). El DELETE nunca toca las entries generadas por
   * `createToothProcedure` (`treatment_id NOT NULL`) — antes de este cambio
   * el deleteMany era global y se llevaba puesto el historial de
   * procedimientos cada vez que el doctor reguardaba el odontograma.
   */
  async createOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]> {
    return this.prisma.transaction(async (tx) => {
      await tx.odontogram_entries.deleteMany({
        where: { patient_id: patientId, treatment_id: null },
      });
      if (entries.length > 0) {
        await tx.odontogram_entries.createMany({
          data: entries.map((e) => ({
            patient_id: patientId,
            tooth_number: e.toothNumber,
            tooth_type: e.toothType ?? 'permanent',
            tooth_condition: e.toothCondition ?? 'sano',
            diagnosis_description: e.diagnosisDescription ?? null,
            treatment_id: e.treatmentId ?? null,
            custom_price: e.customPrice != null ? e.customPrice : null,
            notes: e.notes ?? null,
          })),
        });
      }
      const records = await tx.odontogram_entries.findMany({
        where: { patient_id: patientId },
      });
      return records.map((r) => OdontogramEntryMapper.toDomain(r));
    });
  }

  async findOdontogramEntries(patientId: string): Promise<OdontogramEntry[]> {
    const records = await this.prisma.odontogram_entries.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => OdontogramEntryMapper.toDomain(r));
  }

  async createToothProcedures(
    patientId: string,
    data: CreateToothProcedureData[],
  ): Promise<ToothProcedure[]> {
    const records = await this.prisma.transaction((tx) =>
      Promise.all(
        data.map((item) =>
          tx.tooth_procedures.create({
            data: {
              patient_id: patientId,
              tooth_number: item.toothNumber,
              application_group_id: item.applicationGroupId ?? null,
              treatment_id: item.treatmentId,
              price_charged: item.priceCharged,
              quantity: item.quantity ?? 1,
              procedure_date: item.procedureDate ?? new Date(),
              surface_vestibular: item.surfaceVestibular ?? false,
              surface_palatal: item.surfacePalatal ?? false,
              surface_mesial: item.surfaceMesial ?? false,
              surface_distal: item.surfaceDistal ?? false,
              surface_occlusal: item.surfaceOcclusal ?? false,
              notes: item.notes ?? null,
              performed_by: item.performedBy,
            },
          }),
        ),
      ),
    );
    return records.map((r) => ToothProcedureMapper.toDomain(r));
  }

  async findToothProcedures(patientId: string): Promise<ToothProcedure[]> {
    const records = await this.prisma.tooth_procedures.findMany({
      where: { patient_id: patientId },
      orderBy: { procedure_date: 'desc' },
    });
    return records.map((r) => ToothProcedureMapper.toDomain(r));
  }

  async appendOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]> {
    const records = await this.prisma.transaction((tx) =>
      Promise.all(
        entries.map((e) =>
          tx.odontogram_entries.create({
            data: {
              patient_id: patientId,
              tooth_number: e.toothNumber,
              tooth_type: e.toothType ?? 'permanent',
              tooth_condition: e.toothCondition ?? 'sano',
              diagnosis_description: e.diagnosisDescription ?? null,
              treatment_id: e.treatmentId ?? null,
              custom_price: e.customPrice != null ? e.customPrice : null,
              notes: e.notes ?? null,
            },
          }),
        ),
      ),
    );
    return records.map((r) => OdontogramEntryMapper.toDomain(r));
  }

  /**
   * Append-only: nunca actualiza ni borra una versión existente. version =
   * max(version) + 1 dentro de la misma transacción — dos guardados
   * concurrentes sobre el mismo paciente chocan contra el
   * @@unique([patient_id, version]) en vez de pisarse en silencio.
   */
  async createDentalExam(
    patientId: string,
    recordedBy: string,
    data: CreateDentalExamData,
  ): Promise<DentalExam> {
    const record = await this.prisma.transaction(async (tx) => {
      const last = await tx.dental_exams.findFirst({
        where: { patient_id: patientId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return tx.dental_exams.create({
        data: {
          patient_id: patientId,
          version: (last?.version ?? 0) + 1,
          recorded_by: recordedBy,
          change_reason: data.changeReason ?? null,
          notes: data.notes ?? null,
          dental_exam_findings: {
            create: data.findings.map((f) => ({
              diagnosis_id: f.diagnosisId,
              tooth_number: f.toothNumber ?? null,
              tooth_type: f.toothType ?? null,
              application_group_id: f.applicationGroupId ?? null,
              modifier_value: f.modifierValue ?? null,
              description: f.description ?? null,
              xray_requested: f.xrayRequested ?? false,
              notes: f.notes ?? null,
            })),
          },
        },
        include: DENTAL_EXAM_INCLUDE,
      });
    });
    return DentalExamMapper.toDomain(record);
  }

  async findDentalExamVersions(
    patientId: string,
  ): Promise<DentalExamVersionSummary[]> {
    const records = await this.prisma.dental_exams.findMany({
      where: { patient_id: patientId },
      orderBy: { version: 'desc' },
      include: {
        users: true,
        _count: { select: { dental_exam_findings: true } },
      },
    });
    return records.map((r) => DentalExamMapper.toVersionSummary(r));
  }

  async findCurrentDentalExam(patientId: string): Promise<DentalExam | null> {
    const record = await this.prisma.dental_exams.findFirst({
      where: { patient_id: patientId },
      orderBy: { version: 'desc' },
      include: DENTAL_EXAM_INCLUDE,
    });
    return record ? DentalExamMapper.toDomain(record) : null;
  }

  async findDentalExam(
    patientId: string,
    examId: string,
  ): Promise<DentalExam | null> {
    const record = await this.prisma.dental_exams.findFirst({
      where: { id: examId, patient_id: patientId },
      include: DENTAL_EXAM_INCLUDE,
    });
    return record ? DentalExamMapper.toDomain(record) : null;
  }
}
