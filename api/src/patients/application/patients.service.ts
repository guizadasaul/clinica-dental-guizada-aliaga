import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
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
  CreateToothProcedureGroupData,
  DentalExamFindingData,
} from '../domain/PatientRepository';
import { UserRepository } from '../../auth/domain/UserRepository';
import type { UserRepository as IUserRepository } from '../../auth/domain/UserRepository';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { SupabaseAdminService } from '../../auth/infrastructure/SupabaseAdminService';
import { toE164Bolivia } from '../../shared/phone.util';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { ITreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import {
  assertTeethMatchApplicationType,
  typeGeneratesOdontogramEntries,
  teethForApplicationType,
  InvalidApplicationTypeError,
} from '../../treatments/domain/TreatmentApplicationType';
import type { TreatmentApplicationType } from '../../treatments/domain/TreatmentApplicationType';
import { DiagnosisRepository } from '../../diagnoses/domain/DiagnosisRepository';
import type { IDiagnosisRepository } from '../../diagnoses/domain/DiagnosisRepository';
import type { Diagnosis } from '../../diagnoses/domain/Diagnosis';
import { toothTypeFor } from '../../shared/validators/tooth.validator';
import {
  assertValidSurfacesForTooth,
  InvalidToothSurfaceError,
} from '../../shared/validators/tooth-surface.validator';
import {
  BLACK_CLASSES,
  MOBILITY_GRADES,
} from '../../shared/validators/clinical-options';
import type { Patient } from '../domain/Patient';
import type { MedicalHistory } from '../domain/MedicalHistory';
import type { HygieneHabits } from '../domain/HygieneHabits';
import type { ClinicalExam } from '../domain/ClinicalExam';
import type { PatientWithUser } from '../domain/PatientWithUser';
import type { OdontogramEntry } from '../domain/OdontogramEntry';
import type { ToothProcedure } from '../domain/ToothProcedure';
import type {
  DentalExam,
  DentalExamVersionSummary,
} from '../domain/DentalExam';

/** Un diente dentro de una aplicación, con sus propias superficies (CLI-41). */
interface ToothApplicationInput {
  number: number;
  /** Códigos de tooth_surfaces (CLI-49) — p.ej. ['vestibular', 'occlusal']. */
  surfaces?: string[];
}

interface CreateToothProcedureInput {
  teeth: ToothApplicationInput[];
  treatmentId: string;
  priceCharged: number;
  /** Para aplicaciones por unidad/caja — ver TreatmentApplicationType.typeAllowsQuantity(). */
  quantity?: number;
  procedureDate?: Date;
  notes?: string;
}

interface CreateDentalExamFindingInput {
  diagnosisCode: string;
  toothNumbers?: number[];
  modifierValue?: string;
  description?: string;
  xrayRequested?: boolean;
  notes?: string;
}

interface CreateDentalExamInput {
  findings: CreateDentalExamFindingInput[];
  changeReason?: string;
  notes?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    @Inject(PatientRepository)
    private readonly patientRepo: IPatientRepository,
    @Inject(UserRepository)
    private readonly userRepo: IUserRepository,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
    @Inject(DiagnosisRepository)
    private readonly diagnosisRepo: IDiagnosisRepository,
    private readonly supabaseAdminService: SupabaseAdminService,
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

    // El teléfono vive en users.phone (CLI-51) — se sincroniza ANTES de crear
    // la ficha para que la respuesta ya refleje el valor nuevo (Patient.phone
    // se lee via join a users, igual que en updatePatient).
    if (data.phone !== undefined) {
      await this.userRepo.updateContactInfo(targetUserId, {
        phone: data.phone,
      });
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
    const phone = patientFields.phone;
    if (email !== undefined || phone !== undefined) {
      const user = await this.userRepo.updateContactInfo(patient.userId, {
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      });
      // El teléfono queda utilizable como login (phone + contraseña) recién
      // cuando la cuenta de Supabase ya existe (authUserId no nulo). Si
      // todavía es una ficha placeholder, alcanza con guardarlo en `users` —
      // se confirma en Supabase cuando el paciente reclame la invitación
      // (ver AuthService.tryLinkInvitedUser).
      if (user?.authUserId && phone) {
        await this.supabaseAdminService.setConfirmedPhone(
          user.authUserId,
          toE164Bolivia(phone),
        );
      }
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

  async findMedicalHistory(patientId: string): Promise<MedicalHistory | null> {
    await this.requirePatient(patientId);
    return this.patientRepo.findMedicalHistory(patientId);
  }

  async upsertHygieneHabits(
    patientId: string,
    data: HygieneHabitsData,
  ): Promise<HygieneHabits> {
    await this.requirePatient(patientId);
    return this.patientRepo.upsertHygieneHabits(patientId, data);
  }

  async findHygieneHabits(patientId: string): Promise<HygieneHabits | null> {
    await this.requirePatient(patientId);
    return this.patientRepo.findHygieneHabits(patientId);
  }

  async createClinicalExam(
    patientId: string,
    data: ClinicalExamData,
  ): Promise<ClinicalExam> {
    await this.requirePatient(patientId);
    return this.patientRepo.createClinicalExam(patientId, data);
  }

  async findLatestClinicalExam(
    patientId: string,
  ): Promise<ClinicalExam | null> {
    await this.requirePatient(patientId);
    return this.patientRepo.findLatestClinicalExam(patientId);
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
    data: CreateToothProcedureInput,
  ): Promise<ToothProcedure[]> {
    await this.requirePatient(patientId);
    const user = await this.userRepo.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundException(
        'Usuario autenticado no encontrado en la base de datos',
      );
    }
    const treatment = await this.treatmentRepo.findById(data.treatmentId);
    if (!treatment) {
      throw new NotFoundException(
        `Tratamiento con id ${data.treatmentId} no encontrado`,
      );
    }

    try {
      assertTeethMatchApplicationType(
        treatment.applicationType,
        data.teeth.map((t) => t.number),
      );
      for (const tooth of data.teeth) {
        if (tooth.surfaces?.length) {
          assertValidSurfacesForTooth(tooth.number, tooth.surfaces);
        }
      }
    } catch (error: unknown) {
      if (
        error instanceof InvalidApplicationTypeError ||
        error instanceof InvalidToothSurfaceError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    let created: ToothProcedure[];
    if (treatment.applicationType === 'multiple_teeth') {
      const sortedTeeth = [...data.teeth].sort((a, b) => a.number - b.number);
      created = await this.patientRepo.createToothProcedureGroup(patientId, {
        treatmentId: treatment.id,
        teeth: sortedTeeth.map((tooth) => ({
          toothNumber: tooth.number,
          surfaceCodes: tooth.surfaces,
        })),
        priceCharged: data.priceCharged,
        procedureDate: data.procedureDate,
        notes: data.notes,
        performedBy: user.id,
      });
    } else {
      const rows = this.buildToothProcedureRows(
        treatment.applicationType,
        data,
        user.id,
      );
      created = await this.patientRepo.createToothProcedures(patientId, rows);
    }

    if (typeGeneratesOdontogramEntries(treatment.applicationType)) {
      const existingEntries =
        await this.patientRepo.findOdontogramEntries(patientId);
      const conditionByTooth = new Map<number, string>();
      for (const entry of existingEntries) {
        if (!conditionByTooth.has(entry.toothNumber)) {
          conditionByTooth.set(entry.toothNumber, entry.toothCondition);
        }
      }
      const entries: OdontogramEntryData[] = teethForApplicationType(
        treatment.applicationType,
      ).map((toothNumber) => ({
        toothNumber,
        toothCondition: conditionByTooth.get(toothNumber) ?? 'sano',
        diagnosisDescription: treatment.name,
        treatmentId: treatment.id,
        notes: data.notes,
      }));
      await this.patientRepo.appendOdontogramEntries(patientId, entries);
    }

    return created;
  }

  /**
   * Filas sueltas, cada una con su propio precio — `single_tooth` es un
   * único diente, el resto de los tipos no llevan diente. `multiple_teeth`
   * NO pasa por acá: usa createToothProcedureGroup (CLI-53), con el precio
   * a nivel de grupo en vez de repartido/mentido por fila.
   */
  private buildToothProcedureRows(
    applicationType: TreatmentApplicationType,
    data: CreateToothProcedureInput,
    performedBy: string,
  ): CreateToothProcedureData[] {
    const shared = {
      treatmentId: data.treatmentId,
      procedureDate: data.procedureDate,
      notes: data.notes,
      performedBy,
    };

    if (applicationType === 'single_tooth') {
      const tooth = data.teeth[0];
      return [
        {
          ...shared,
          toothNumber: tooth.number,
          priceCharged: data.priceCharged,
          quantity: data.quantity ?? 1,
          surfaceCodes: tooth.surfaces,
        },
      ];
    }

    return [
      {
        ...shared,
        quantity: data.quantity ?? 1,
        toothNumber: null,
        priceCharged: data.priceCharged,
      },
    ];
  }

  async findToothProcedures(patientId: string): Promise<ToothProcedure[]> {
    await this.requirePatient(patientId);
    return this.patientRepo.findToothProcedures(patientId);
  }

  /**
   * Valida cada finding contra el catálogo (existe, alcance coherente con
   * las piezas enviadas, modificador presente/ausente según corresponda) y
   * crea la próxima versión del examen — append-only, ver
   * PatientRepository.createDentalExam.
   */
  async createDentalExam(
    patientId: string,
    authUserId: string,
    data: CreateDentalExamInput,
  ): Promise<DentalExam> {
    await this.requirePatient(patientId);
    const user = await this.userRepo.findByAuthUserId(authUserId);
    if (!user) {
      throw new NotFoundException(
        'Usuario autenticado no encontrado en la base de datos',
      );
    }

    const codes = [...new Set(data.findings.map((f) => f.diagnosisCode))];
    const diagnoses = await this.diagnosisRepo.findByCodes(codes);
    const diagnosisByCode = new Map(diagnoses.map((d) => [d.code, d]));

    const findings = data.findings.flatMap((finding) =>
      this.buildDentalExamFindingRows(finding, diagnosisByCode),
    );

    return this.patientRepo.createDentalExam(patientId, user.id, {
      findings,
      changeReason: data.changeReason,
      notes: data.notes,
    });
  }

  private buildDentalExamFindingRows(
    finding: CreateDentalExamFindingInput,
    diagnosisByCode: Map<string, Diagnosis>,
  ): DentalExamFindingData[] {
    const diagnosis = diagnosisByCode.get(finding.diagnosisCode);
    if (!diagnosis) {
      throw new BadRequestException(
        `Diagnóstico desconocido: ${finding.diagnosisCode}`,
      );
    }

    const teeth = finding.toothNumbers ?? [];
    if (diagnosis.scope === 'general' && teeth.length > 0) {
      throw new BadRequestException(
        `"${diagnosis.name}" es un hallazgo general, no admite piezas.`,
      );
    }
    if (diagnosis.scope === 'single_tooth' && teeth.length !== 1) {
      throw new BadRequestException(
        `"${diagnosis.name}" requiere exactamente una pieza.`,
      );
    }
    if (diagnosis.scope === 'multiple_teeth' && teeth.length < 1) {
      throw new BadRequestException(
        `"${diagnosis.name}" requiere al menos una pieza.`,
      );
    }

    if (diagnosis.modifier === 'none' && finding.modifierValue) {
      throw new BadRequestException(
        `"${diagnosis.name}" no admite modificador.`,
      );
    }
    if (
      diagnosis.modifier === 'black_class' &&
      !(BLACK_CLASSES as readonly string[]).includes(
        finding.modifierValue ?? '',
      )
    ) {
      throw new BadRequestException(
        `"${diagnosis.name}" requiere una clase de Black (I–V).`,
      );
    }
    if (
      diagnosis.modifier === 'mobility_grade' &&
      !(MOBILITY_GRADES as readonly string[]).includes(
        finding.modifierValue ?? '',
      )
    ) {
      throw new BadRequestException(
        `"${diagnosis.name}" requiere un grado de movilidad (I–IV).`,
      );
    }

    const shared = {
      diagnosisId: diagnosis.id,
      modifierValue: finding.modifierValue,
      description: finding.description,
      xrayRequested: finding.xrayRequested,
      notes: finding.notes,
    };

    if (teeth.length === 0) {
      return [{ ...shared }];
    }

    const applicationGroupId = teeth.length > 1 ? randomUUID() : undefined;
    return teeth.map((toothNumber) => ({
      ...shared,
      toothNumber,
      toothType: toothTypeFor(toothNumber) ?? undefined,
      applicationGroupId,
    }));
  }

  async findDentalExamVersions(
    patientId: string,
  ): Promise<DentalExamVersionSummary[]> {
    await this.requirePatient(patientId);
    return this.patientRepo.findDentalExamVersions(patientId);
  }

  async findCurrentDentalExam(patientId: string): Promise<DentalExam | null> {
    await this.requirePatient(patientId);
    return this.patientRepo.findCurrentDentalExam(patientId);
  }

  async findDentalExam(patientId: string, examId: string): Promise<DentalExam> {
    await this.requirePatient(patientId);
    const exam = await this.patientRepo.findDentalExam(patientId, examId);
    if (!exam) {
      throw new NotFoundException(
        `Examen dental con id ${examId} no encontrado`,
      );
    }
    return exam;
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
