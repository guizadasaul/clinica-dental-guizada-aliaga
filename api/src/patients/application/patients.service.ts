import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PatientRepository } from '../domain/PatientRepository';
import type {
  IPatientRepository,
  CreatePatientData,
  UpdatePatientData,
  MedicalHistoryData,
  HygieneHabitsData,
  ClinicalExamData,
  OdontogramEntryData,
  CreateToothProcedureData,
} from '../domain/PatientRepository';
import { UserRepository } from '../../auth/domain/UserRepository';
import type { UserRepository as IUserRepository } from '../../auth/domain/UserRepository';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
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

  /**
   * El dashboard del doctor ya usa este endpoint para crear la ficha de OTRO
   * usuario (selecciona un userId de la lista) — por eso la resolución del
   * target no puede ser simplemente "usar el propio id del caller". Un
   * odontólogo puede targetear cualquier userId; un paciente solo el suyo.
   */
  async createPatient(
    callerAuthUserId: string,
    requestedUserId: string | undefined,
    data: CreatePatientData,
  ): Promise<Patient> {
    const caller = await this.userRepo.findByAuthUserId(callerAuthUserId);
    if (!caller) {
      throw new NotFoundException(
        'Usuario autenticado no encontrado en la base de datos',
      );
    }

    let targetUserId: string;
    if (caller.role === UserRole.ODONTOLOGIST) {
      targetUserId = requestedUserId ?? caller.id;
    } else {
      if (requestedUserId && requestedUserId !== caller.id) {
        throw new ForbiddenException('No podés crear la ficha de otro usuario');
      }
      targetUserId = caller.id;
    }

    try {
      return await this.patientRepo.create(targetUserId, data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Unique constraint') || msg.includes('unique')) {
        throw new ConflictException(
          'El paciente ya tiene una ficha registrada',
        );
      }
      throw error;
    }
  }

  async updatePatient(
    patientId: string,
    data: UpdatePatientData & { email?: string },
  ): Promise<Patient> {
    const { email, ...patientFields } = data;
    const patient = await this.patientRepo.updatePatient(
      patientId,
      patientFields,
    );
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
    if (email !== undefined) {
      await this.userRepo.updateContactInfo(patient.userId, { email });
    }
    return patient;
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
    authUserId: string,
    data: Omit<CreateToothProcedureData, 'performedBy'>,
  ): Promise<ToothProcedure> {
    await this.requirePatient(patientId);
    const user = await this.userRepo.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundException(
        'Usuario autenticado no encontrado en la base de datos',
      );
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

  async findMyPatient(authUserId: string): Promise<Patient> {
    const user = await this.userRepo.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundException(
        'Usuario autenticado no encontrado en la base de datos',
      );
    }
    const patient = await this.patientRepo.findByUserId(user.id);
    if (!patient) {
      throw new NotFoundException('No tenés un perfil de paciente registrado');
    }
    return patient;
  }

  async findMyPatientStatus(
    authUserId: string,
  ): Promise<{ exists: boolean; patient: Patient | null }> {
    const user = await this.userRepo.findByAuthUserId(authUserId);
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
