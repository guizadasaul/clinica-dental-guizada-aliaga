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
} from '../../domain/PatientRepository';
import type { Patient } from '../../domain/Patient';
import type { MedicalHistory } from '../../domain/MedicalHistory';
import type { HygieneHabits } from '../../domain/HygieneHabits';
import type { ClinicalExam } from '../../domain/ClinicalExam';
import type { PatientWithUser } from '../../domain/PatientWithUser';
import type { OdontogramEntry } from '../../domain/OdontogramEntry';
import type { ToothProcedure } from '../../domain/ToothProcedure';
import { PatientMapper } from './patient.mapper';
import { OdontogramEntryMapper } from './odontogram-entry.mapper';
import { ToothProcedureMapper } from './tooth-procedure.mapper';

@Injectable()
export class PrismaPatientsRepository implements IPatientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithUsers(): Promise<PatientWithUser[]> {
    const records = await this.prisma.users.findMany({
      where: { role: 'patient' },
      include: {
        patients: {
          include: {
            _count: { select: { odontogram_entries: true } },
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

  async createClinicalExam(
    patientId: string,
    data: ClinicalExamData,
  ): Promise<ClinicalExam> {
    const record = await this.prisma.clinical_exams.create({
      data: {
        patient_id: patientId,
        tartar: data.tartar ?? false,
        saburra: data.saburra ?? false,
        bacterial_plaque: data.bacterialPlaque ?? false,
        halitosis: data.halitosis ?? false,
        occlusion: data.occlusion ?? null,
      },
    });
    return PatientMapper.toDomainClinicalExam(record);
  }

  async createOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]> {
    await this.prisma.odontogram_entries.deleteMany({
      where: { patient_id: patientId },
    });
    const records = await Promise.all(
      entries.map((e) =>
        this.prisma.odontogram_entries.create({
          data: {
            patient_id: patientId,
            tooth_number: e.toothNumber,
            tooth_type: e.toothType ?? 'permanent',
            diagnosis_type: e.diagnosisType,
            tooth_condition: e.toothCondition ?? 'sano',
            diagnosis_description: e.diagnosisDescription,
            xray_requested: e.xrayRequested ?? false,
            treatment_id: e.treatmentId ?? null,
            custom_price: e.customPrice != null ? e.customPrice : null,
            notes: e.notes ?? null,
          },
        }),
      ),
    );
    return records.map((r) => OdontogramEntryMapper.toDomain(r));
  }

  async findOdontogramEntries(patientId: string): Promise<OdontogramEntry[]> {
    const records = await this.prisma.odontogram_entries.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => OdontogramEntryMapper.toDomain(r));
  }

  async createToothProcedure(
    patientId: string,
    data: CreateToothProcedureData,
  ): Promise<ToothProcedure> {
    const record = await this.prisma.tooth_procedures.create({
      data: {
        patient_id: patientId,
        tooth_number: data.toothNumber,
        treatment_id: data.treatmentId,
        price_charged: data.priceCharged,
        procedure_date: data.procedureDate ?? new Date(),
        surface_vestibular: data.surfaceVestibular ?? false,
        surface_palatal: data.surfacePalatal ?? false,
        surface_mesial: data.surfaceMesial ?? false,
        surface_distal: data.surfaceDistal ?? false,
        surface_occlusal: data.surfaceOcclusal ?? false,
        notes: data.notes ?? null,
        performed_by: data.performedBy,
      },
    });
    return ToothProcedureMapper.toDomain(record);
  }

  async findToothProcedures(patientId: string): Promise<ToothProcedure[]> {
    const records = await this.prisma.tooth_procedures.findMany({
      where: { patient_id: patientId },
      orderBy: { procedure_date: 'desc' },
    });
    return records.map((r) => ToothProcedureMapper.toDomain(r));
  }
}
