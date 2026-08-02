import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { PatientRepository } from '../domain/PatientRepository';
import type {
  IPatientRepository,
  CreatePatientData,
  MedicalHistoryData,
  HygieneHabitsData,
  ClinicalExamData,
  OdontogramEntryData,
  CreateToothProcedureData,
} from '../domain/PatientRepository';
import { UserRepository } from '../../auth/domain/UserRepository';
import type { UserRepository as IUserRepository } from '../../auth/domain/UserRepository';
import type { Patient } from '../domain/Patient';
import type { MedicalHistory } from '../domain/MedicalHistory';
import type { HygieneHabits } from '../domain/HygieneHabits';
import type { ClinicalExam } from '../domain/ClinicalExam';
import type { PatientWithUser } from '../domain/PatientWithUser';
import type { OdontogramEntry } from '../domain/OdontogramEntry';
import type { ToothProcedure } from '../domain/ToothProcedure';

@Injectable()
export class PatientsService {
  constructor(
    @Inject(PatientRepository)
    private readonly patientRepo: IPatientRepository,
    @Inject(UserRepository)
    private readonly userRepo: IUserRepository,
  ) {}

  findAll(): Promise<PatientWithUser[]> {
    return this.patientRepo.findAllWithUsers();
  }

  async createPatient(userId: string, data: CreatePatientData): Promise<Patient> {
    try {
      return await this.patientRepo.create(userId, data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Unique constraint') || msg.includes('unique')) {
        throw new ConflictException('El paciente ya tiene una ficha registrada');
      }
      throw error;
    }
  }

  async upsertMedicalHistory(
    patientId: string,
    data: MedicalHistoryData,
  ): Promise<MedicalHistory> {
    await this.requirePatient(patientId);
    return this.patientRepo.upsertMedicalHistory(patientId, data);
  }

  async upsertHygieneHabits(
    patientId: string,
    data: HygieneHabitsData,
  ): Promise<HygieneHabits> {
    await this.requirePatient(patientId);
    return this.patientRepo.upsertHygieneHabits(patientId, data);
  }

  async createClinicalExam(
    patientId: string,
    data: ClinicalExamData,
  ): Promise<ClinicalExam> {
    await this.requirePatient(patientId);
    return this.patientRepo.createClinicalExam(patientId, data);
  }

  async createOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]> {
    await this.requirePatient(patientId);
    return this.patientRepo.createOdontogramEntries(patientId, entries);
  }

  async findOdontogramEntries(patientId: string): Promise<OdontogramEntry[]> {
    await this.requirePatient(patientId);
    return this.patientRepo.findOdontogramEntries(patientId);
  }

  async createToothProcedure(
    patientId: string,
    firebaseUid: string,
    data: Omit<CreateToothProcedureData, 'performedBy'>,
  ): Promise<ToothProcedure> {
    await this.requirePatient(patientId);
    const user = await this.userRepo.findByFirebaseUid(firebaseUid);
    if (!user) {
      throw new NotFoundException('Usuario autenticado no encontrado en la base de datos');
    }
    return this.patientRepo.createToothProcedure(patientId, {
      ...data,
      performedBy: user.id,
    });
  }

  async findToothProcedures(patientId: string): Promise<ToothProcedure[]> {
    await this.requirePatient(patientId);
    return this.patientRepo.findToothProcedures(patientId);
  }

  async findMyPatient(firebaseUid: string): Promise<Patient> {
    const user = await this.userRepo.findByFirebaseUid(firebaseUid);
    if (!user) {
      throw new NotFoundException('Usuario autenticado no encontrado en la base de datos');
    }
    const patient = await this.patientRepo.findByUserId(user.id);
    if (!patient) {
      throw new NotFoundException('No tenés un perfil de paciente registrado');
    }
    return patient;
  }

  async findMyPatientStatus(
    firebaseUid: string,
  ): Promise<{ exists: boolean; patient: Patient | null }> {
    const user = await this.userRepo.findByFirebaseUid(firebaseUid);
    if (!user) {
      return { exists: false, patient: null };
    }
    const patient = await this.patientRepo.findByUserId(user.id);
    return { exists: patient !== null, patient };
  }

  private async requirePatient(patientId: string): Promise<void> {
    const patient = await this.patientRepo.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
  }
}
