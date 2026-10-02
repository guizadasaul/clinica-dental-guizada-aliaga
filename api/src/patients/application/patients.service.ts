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
  MedicalConditionEntryData,
  HygieneHabitsData,
  ClinicalExamData,
  OdontogramEntryData,
  CreateToothProcedureData,
  DentalExamFindingData,
} from '../domain/PatientRepository';
import { UserRepository } from '../../auth/domain/UserRepository';
import type { UserRepository as IUserRepository } from '../../auth/domain/UserRepository';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { PhoneLoginError } from '../../auth/domain/value-objects/PhoneLoginError';
import { SupabaseAdminService } from '../../auth/infrastructure/SupabaseAdminService';
import { toE164, toE164Bolivia } from '../../shared/phone.util';
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
import { MedicalConditionRepository } from '../../medical-conditions/domain/MedicalConditionRepository';
import type { IMedicalConditionRepository } from '../../medical-conditions/domain/MedicalConditionRepository';
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
  DentalExamKind,
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
  kind?: DentalExamKind;
  changeReason?: string;
  notes?: string;
}

/** Una condición dentro del historial, con SU código de catálogo (CLI-50). */
interface MedicalConditionEntryInput {
  code: string;
  diagnosedAt?: Date;
  notes?: string;
}

interface PatientMedicationInput {
  drugName: string;
  dose?: string;
  frequency?: string;
  startedAt?: Date;
}

interface UpsertMedicalHistoryInput {
  conditions?: MedicalConditionEntryInput[];
  otherDiseases?: string;
  gestationLmpDate?: Date;
  // Tri-estado (Sí / No / No sabe) — `null` es un valor legítimo, distinto
  // de "no enviado" (`undefined`).
  anesthesiaReactions?: boolean | null;
  medications?: PatientMedicationInput[];
}

/** "Nombre Apellido Paterno Materno" de una ficha o de los datos de alta. */
function patientFullName(p: {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal?: string | null;
}): string {
  return [p.firstName, p.lastNamePaternal, p.lastNameMaternal]
    .filter(Boolean)
    .join(' ');
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
    @Inject(MedicalConditionRepository)
    private readonly medicalConditionRepo: IMedicalConditionRepository,
    private readonly supabaseAdminService: SupabaseAdminService,
  ) {}

  /** doctorId es un filtro de conveniencia (no de seguridad) — visibilidad compartida sin él, igual que siempre. */
  findAll(doctorId?: string): Promise<PatientWithUser[]> {
    return this.patientRepo.findAllWithUsers(doctorId);
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

    // Un odontólogo sin userId registra a un paciente nuevo, que llegó a la
    // clínica sin reserva previa (CLI-171). Antes caía en caller.id, o sea,
    // intentaba hacerle una ficha al propio doctor.
    if (caller.role === UserRole.ODONTOLOGIST && !requestedUserId) {
      return this.registerNewPatient(caller.id, data);
    }

    let targetUserId: string;
    if (caller.role === UserRole.ODONTOLOGIST) {
      targetUserId = requestedUserId!;
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

    // CLI-58: doctor asignado = quien hace el alta, solo cuando quien la hace
    // es un odontólogo — un paciente autorregistrando su propia ficha (rama
    // de arriba) no tiene doctor asignado todavía.
    const assignedDoctorId =
      caller.role === UserRole.ODONTOLOGIST ? caller.id : undefined;

    try {
      return await this.patientRepo.create(targetUserId, {
        ...data,
        assignedDoctorId,
      });
    } catch (error: unknown) {
      throw this.toCreateConflict(error) ?? error;
    }
  }

  /**
   * Alta de un paciente nuevo, sin cuenta (CLI-171). Antes de crear, se busca
   * si ya está en el sistema por documento o por teléfono, y el mensaje dice
   * quién es para que el doctor use esa ficha en vez de duplicarla.
   */
  private async registerNewPatient(
    doctorId: string,
    data: CreatePatientData,
  ): Promise<Patient> {
    if (data.documentType && data.dni) {
      const existing = await this.patientRepo.findByDocument(
        data.documentType,
        data.dni,
      );
      if (existing) {
        throw new ConflictException(
          `Ya existe ${patientFullName(existing)} con ese documento. Buscalo en la lista de pacientes.`,
        );
      }
    }
    const e164 = data.phone ? toE164(data.phone) : null;
    if (e164) {
      const [owner] = await this.userRepo.findActiveByPhone(e164);
      if (owner) {
        throw new ConflictException(
          `Ya existe ${owner.displayName ?? 'una persona'} con ese teléfono. Buscala en la lista de pacientes.`,
        );
      }
    }
    try {
      return await this.patientRepo.createWithPlaceholderUser(
        { displayName: patientFullName(data), phone: data.phone ?? null },
        { ...data, assignedDoctorId: doctorId },
      );
    } catch (error: unknown) {
      throw this.toCreateConflict(error) ?? error;
    }
  }

  /** Un choque de unicidad al crear la ficha: documento repetido o ficha ya existente para ese usuario. */
  private toCreateConflict(error: unknown): ConflictException | null {
    const msg = error instanceof Error ? error.message : '';
    if (!msg.includes('Unique constraint') && !msg.includes('unique')) {
      return null;
    }
    return new ConflictException(
      msg.includes('document_type') || msg.includes('dni')
        ? 'Ya existe un paciente con ese documento'
        : 'El paciente ya tiene una ficha registrada',
    );
  }

  async updatePatient(
    patientId: string,
    data: UpdatePatientData & { email?: string },
  ): Promise<Patient> {
    const { email, ...patientFields } = data;
    const phone = patientFields.phone;
    // Antes de guardar nada: si el teléfono está en otra cuenta de Supabase
    // Auth, el cambio se rechaza entero (CLI-143) en vez de quedar a medias.
    const phoneLoginError = phone
      ? await this.enablePhoneLogin(patientId, phone)
      : undefined;
    const patient = await this.patientRepo.updatePatient(
      patientId,
      patientFields,
    );
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
    if (
      email === undefined &&
      phone === undefined &&
      phoneLoginError === undefined
    ) {
      return patient;
    }
    await this.userRepo.updateContactInfo(patient.userId, {
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(phoneLoginError !== undefined && { phoneLoginError }),
    });
    // El teléfono y su marca viven en `users`: se relee para que la
    // respuesta ya los refleje.
    return (await this.patientRepo.findPatientById(patientId)) ?? patient;
  }

  /**
   * Habilita el teléfono como login (phone + contraseña) en Supabase Auth.
   * Solo aplica si la cuenta ya existe (authUserId no nulo): en una ficha
   * placeholder alcanza con guardarlo en `users`, y se confirma cuando el
   * paciente reclame la invitación (ver AuthService.tryLinkInvitedUser).
   *
   * Devuelve la marca a guardar en users.phone_login_error: null si quedó
   * habilitado, 'unknown' si Supabase falló por otro motivo (el resto de la
   * ficha se guarda igual y el doctor ve el aviso), o undefined si todavía no
   * hay cuenta. Un teléfono que ya usa otra cuenta es un 409.
   */
  private async enablePhoneLogin(
    patientId: string,
    phone: string,
  ): Promise<PhoneLoginError | null | undefined> {
    const current = await this.patientRepo.findPatientById(patientId);
    if (!current) {
      throw new NotFoundException(`Paciente con id ${patientId} no encontrado`);
    }
    const user = await this.userRepo.findById(current.userId);
    if (!user?.authUserId) {
      return undefined;
    }
    const result = await this.supabaseAdminService.setConfirmedPhone(
      user.authUserId,
      toE164Bolivia(phone),
    );
    if (result.ok) {
      return null;
    }
    if (result.reason === PhoneLoginError.PHONE_IN_USE) {
      throw new ConflictException(
        'Ese teléfono ya está registrado en otra cuenta, así que no se puede usar para iniciar sesión. Usá otro número.',
      );
    }
    return result.reason;
  }

  async upsertMedicalHistory(
    patientId: string,
    data: UpsertMedicalHistoryInput,
  ): Promise<MedicalHistory> {
    await this.requirePatient(patientId);

    const entries = data.conditions ?? [];
    const codes = [...new Set(entries.map((c) => c.code))];
    const catalog = await this.medicalConditionRepo.findByCodes(codes);
    const conditionByCode = new Map(catalog.map((c) => [c.code, c]));

    const conditions: MedicalConditionEntryData[] = entries.map((entry) => {
      const condition = conditionByCode.get(entry.code);
      if (!condition) {
        throw new BadRequestException(
          `Condición médica desconocida: ${entry.code}`,
        );
      }
      return {
        medicalConditionId: condition.id,
        diagnosedAt: entry.diagnosedAt,
        notes: entry.notes,
      };
    });

    return this.patientRepo.upsertMedicalHistory(patientId, {
      conditions,
      otherDiseases: data.otherDiseases,
      gestationLmpDate: data.gestationLmpDate,
      anesthesiaReactions: data.anesthesiaReactions,
      medications: data.medications,
    });
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

    this.assertValidTeethSelection(treatment.applicationType, data.teeth);

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
      // CLI-52: diagnosisDescription ya no se llena acá — duplicaba
      // treatments.name, accesible vía treatmentId sin necesidad de copiarlo.
      const entries: OdontogramEntryData[] = teethForApplicationType(
        treatment.applicationType,
      ).map((toothNumber) => ({
        toothNumber,
        toothCondition: conditionByTooth.get(toothNumber) ?? 'sano',
        treatmentId: treatment.id,
        notes: data.notes,
      }));
      await this.patientRepo.appendOdontogramEntries(patientId, entries);
    }

    return created;
  }

  /** Dientes y superficies coherentes con el tipo de aplicación, o 400. */
  private assertValidTeethSelection(
    applicationType: TreatmentApplicationType,
    teeth: CreateToothProcedureInput['teeth'],
  ): void {
    try {
      assertTeethMatchApplicationType(
        applicationType,
        teeth.map((t) => t.number),
      );
      for (const tooth of teeth) {
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
      kind: data.kind,
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

  async findMyToothProcedures(authUserId: string): Promise<ToothProcedure[]> {
    const patient = await this.findMyPatient(authUserId);
    return this.patientRepo.findToothProcedures(patient.id);
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
