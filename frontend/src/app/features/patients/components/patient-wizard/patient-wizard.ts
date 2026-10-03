import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import { MedicalConditionsService } from '../../../medical-conditions/services/medical-conditions.service';
import { StepPatientDataComponent } from './steps/step-patient-data/step-patient-data';
import { StepMedicalHistoryComponent } from './steps/step-medical-history/step-medical-history';
import { StepOralHygieneComponent } from './steps/step-oral-hygiene/step-oral-hygiene';
import type { OralHygieneSubmit } from './steps/step-oral-hygiene/step-oral-hygiene';
import { StepOdontogramComponent, type DentalExamMode } from './steps/step-odontogram/step-odontogram';
import type { Patient, PatientFieldOptions } from '../../models/patient.model';
import { EMPTY_FIELD_OPTIONS } from '../../models/patient.model';
import type { DentalExam, DentalExamVersionSummary } from '../../models/dental-exam.model';
import type { DiagnosisCategory } from '../../../diagnoses/models/diagnosis.model';
import type { MedicalCondition } from '../../../medical-conditions/models/medical-condition.model';
import type {
  CreatePatientRequest,
  CreateMedicalHistoryRequest,
} from '../../models/patient.request';
import type { CreateDentalExamRequest } from '../../models/dental-exam.request';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

interface WizardStep {
  readonly number: number;
  readonly label: string;
}

// 4 pasos (CLI-40) — los que eran "Hábitos de higiene" y "Examen clínico" se
// fusionaron en un único paso "Higiene bucal" (ver step-oral-hygiene).
const STEPS: WizardStep[] = [
  { number: 1, label: 'Datos personales' },
  { number: 2, label: 'Antecedentes personales' },
  { number: 3, label: 'Higiene bucal' },
  { number: 4, label: 'Examen dental' },
];

/** `message` del cuerpo de un HttpErrorResponse (string o string[] de class-validator), si trae algo usable. */
function backendMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('error' in err)) {
    return null;
  }
  const body = (err as { error?: unknown }).error;
  if (!body || typeof body !== 'object' || !('message' in body)) {
    return null;
  }
  return messageText((body as { message?: unknown }).message);
}

/** El backend rechazó el pedido (400, 409, 422): hay algo que corregir, reintentar igual no sirve. */
function isClientError(err: unknown): boolean {
  const status = err && typeof err === 'object' ? (err as { status?: unknown }).status : undefined;
  return status === 400 || status === 409 || status === 422;
}

function messageText(message: unknown): string | null {
  if (typeof message === 'string') {
    return message.trim() ? message : null;
  }
  if (Array.isArray(message)) {
    const lines = message.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
    return lines.length > 0 ? lines.join(' ') : null;
  }
  return null;
}

@Component({
  selector: 'app-patient-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, 
    StepPatientDataComponent,
    StepMedicalHistoryComponent,
    StepOralHygieneComponent,
    StepOdontogramComponent,
  ],
  templateUrl: './patient-wizard.html',
  styleUrl: './patient-wizard.scss',
})
export class PatientWizardComponent implements OnInit {
  private readonly patientsService = inject(PatientsService);
  private readonly diagnosesService = inject(DiagnosesService);
  private readonly medicalConditionsService = inject(MedicalConditionsService);

  /** Vacío = paciente nuevo, sin una persona preexistente (CLI-171). */
  readonly userId = input('');
  readonly existingPatientId = input<string | null>(null);
  /** Paciente ya cargado (viene de patients-list.html, que ya tiene el objeto completo en el
   * template) — permite precargar el paso 1 en vez de abrirlo en blanco sobre una ficha existente. */
  readonly existingPatient = input<Patient | null>(null);
  /** Paso donde arranca al editar un paciente existente — 4 (examen dental) por defecto. La agenda del doctor pasa 2 para abrir el historial clínico completo. */
  readonly startStep = input(4);
  /** Paso del examen dental: `new` = diagnóstico nuevo en blanco, `correct` = corregir el vigente (CLI-109). */
  readonly examMode = input<DentalExamMode>('correct');
  readonly wizardComplete = output<void>();
  readonly cancelled = output<void>();

  protected readonly steps = STEPS;
  protected readonly currentStep = signal(1);
  protected readonly patientId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

  /**
   * Pasos que ya se abrieron (CLI-182). Los pasos 1 a 3 quedan montados (solo
   * se ocultan) para conservar lo que el doctor escribió: el paciente nuevo
   * recién se crea al terminar el paso 3, así que volver atrás no puede
   * vaciar los formularios.
   */
  protected readonly visitedSteps = signal<number[]>([]);

  /**
   * Alta de un paciente nuevo (CLI-182): los pasos 1 y 2 se guardan acá y
   * recién al terminar el paso 3 se crea el paciente, con sus antecedentes.
   * Cerrar el asistente antes no deja nada creado.
   */
  private pendingPatient: Omit<CreatePatientRequest, 'userId'> | null = null;
  private pendingMedicalHistory: CreateMedicalHistoryRequest | null = null;

  protected readonly isEditMode = computed(() => !!this.existingPatientId());
  /** Se entró directo al examen dental (nuevo diagnóstico o corrección): no se tocó el resto de la ficha. */
  protected readonly onlyDentalExam = computed(() => this.isEditMode() && this.startStep() === 4);
  protected readonly wizardTitle = computed(() => {
    if (!this.isEditMode()) {
      return 'Registro de nuevo paciente';
    }
    if (this.startStep() === 4) {
      return this.examMode() === 'new' ? 'Nuevo diagnóstico' : 'Corregir diagnóstico';
    }
    if (this.startStep() === 1) {
      return 'Registrar diagnóstico';
    }
    return 'Completar historial clínico';
  });

  protected readonly diagnosisCatalog = signal<DiagnosisCategory[]>([]);
  /** Los que más usa el doctor — atajo "Frecuentes" del selector de diagnóstico (CLI-118); vacío si falla. */
  protected readonly frequentDiagnosisCodes = toSignal(
    this.diagnosesService.getFrequentCodes().pipe(catchError(() => of([] as string[]))),
    { initialValue: [] as string[] },
  );
  protected readonly medicalConditionsCatalog = signal<MedicalCondition[]>([]);
  /** Sugerencias de lugar de nacimiento, zona y ciudad para el paso 1 (CLI-178). */
  protected readonly fieldOptions = signal<PatientFieldOptions>(EMPTY_FIELD_OPTIONS);
  protected readonly currentDentalExam = signal<DentalExam | null>(null);
  protected readonly dentalExamVersions = signal<DentalExamVersionSummary[]>([]);

  constructor() {
    effect(() => {
      const existingId = this.existingPatientId();
      if (existingId) {
        this.patientId.set(existingId);
        this.currentStep.set(this.startStep());
        // Directo, sin esperar al efecto de abajo: así el paso 1 no se monta de
        // pasada (ni un instante) cuando se abre en otro paso, sin importar el
        // orden en que corran los efectos.
        this.visitedSteps.set([this.startStep()]);
        void this.loadDentalExam(existingId);
      }
    }, { allowSignalWrites: true });
    // Después del efecto de arriba: al editar un paciente existente el primer
    // paso visible es startStep, y el paso 1 no debe montarse de pasada.
    effect(() => {
      const step = this.currentStep();
      this.visitedSteps.update((visited) => (visited.includes(step) ? visited : [...visited, step]));
    });
  }

  ngOnInit(): void {
    void this.loadDiagnosisCatalog();
    void this.loadMedicalConditionsCatalog();
    void this.loadFieldOptions();
  }

  private async loadFieldOptions(): Promise<void> {
    try {
      this.fieldOptions.set(await firstValueFrom(this.patientsService.getFieldOptions()));
    } catch {
      // no-op: los campos funcionan igual, solo que sin sugerencias
    }
  }

  private async loadDiagnosisCatalog(): Promise<void> {
    try {
      const catalog = await firstValueFrom(this.diagnosesService.getCatalog());
      this.diagnosisCatalog.set(catalog);
    } catch {
      // no-op: el step 5 arranca con el catálogo vacío (el select queda sin opciones)
    }
  }

  private async loadMedicalConditionsCatalog(): Promise<void> {
    try {
      const catalog = await firstValueFrom(this.medicalConditionsService.getCatalog());
      this.medicalConditionsCatalog.set(catalog);
    } catch {
      // no-op: el paso 2 arranca sin checkboxes de condiciones si el catálogo no carga
    }
  }

  private async loadDentalExam(patientId: string): Promise<void> {
    try {
      const [current, versions] = await Promise.all([
        firstValueFrom(this.patientsService.getCurrentDentalExam(patientId)),
        firstValueFrom(this.patientsService.getDentalExamVersions(patientId)),
      ]);
      this.currentDentalExam.set(current);
      this.dentalExamVersions.set(versions);
    } catch {
      // no-op: el step 5 arranca sin examen previo (paciente sin diagnóstico aún)
    }
  }

  /**
   * class-validator devuelve el 400 como `{ message: string | string[], ... }`
   * (un string por regla que falló). Antes los 5 `catch` se comían ese detalle
   * y mostraban siempre el mismo mensaje genérico, incluso para un DNI
   * duplicado (409) o una fecha futura (400) — ahora se muestra lo que mandó
   * el backend, y solo se cae al genérico si la respuesta no trae nada usable.
   */
  private extractErrorMessage(err: unknown, fallback: string): string {
    return backendMessage(err) ?? fallback;
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  protected async onStep1Submit(data: Omit<CreatePatientRequest, 'userId'>): Promise<void> {
    const existingId = this.patientId();
    if (!existingId) {
      // Paciente nuevo: todavía no se crea (CLI-182), se guarda al terminar el paso 3.
      this.pendingPatient = data;
      this.error.set(null);
      this.currentStep.set(2);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const patient = await firstValueFrom(this.patientsService.updatePatient(existingId, data));
      this.patientId.set(patient.id);
      this.currentStep.set(2);
    } catch (err) {
      this.error.set(this.extractErrorMessage(err, 'Error al guardar los datos del paciente. Intente nuevamente.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async onStep2Submit(data: CreateMedicalHistoryRequest): Promise<void> {
    const id = this.patientId();
    if (!id) {
      this.pendingMedicalHistory = data;
      this.error.set(null);
      this.currentStep.set(3);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.patientsService.createMedicalHistory(id, data));
      this.currentStep.set(3);
    } catch (err) {
      this.error.set(this.extractErrorMessage(err, 'Error al guardar el historial médico. Intente nuevamente.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** "Higiene bucal" (CLI-40) manda dos POST — el paso fusiona dos pasos viejos, el backend no cambió. */
  protected async onStep3Submit(data: OralHygieneSubmit): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      try {
        await this.persistPendingPatient();
      } catch (err) {
        // Un rechazo del backend al crear (documento, teléfono o correo repetido,
        // un dato inválido) se corrige en el paso 1; un error de red se reintenta acá.
        if (!this.patientId() && isClientError(err)) {
          this.currentStep.set(1);
        }
        this.error.set(this.extractErrorMessage(err, 'Error al guardar los datos del paciente. Intente nuevamente.'));
        return;
      }
      const id = this.patientId();
      if (!id) { return; }
      try {
        await Promise.all([
          firstValueFrom(this.patientsService.createHygieneHabits(id, data.hygieneHabits)),
          firstValueFrom(this.patientsService.createClinicalExam(id, data.clinicalExam)),
        ]);
        this.currentStep.set(4);
      } catch (err) {
        this.error.set(this.extractErrorMessage(err, 'Error al guardar la higiene bucal. Intente nuevamente.'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Crea el paciente nuevo con los datos de los pasos 1 y 2 (CLI-182). Cada
   * parte se da por hecha apenas se guarda, así que reintentar tras un fallo
   * a medias no duplica al paciente ni sus antecedentes.
   */
  private async persistPendingPatient(): Promise<void> {
    if (!this.patientId() && this.pendingPatient) {
      const userId = this.userId();
      const patient = await firstValueFrom(
        this.patientsService.createPatient({ ...this.pendingPatient, ...(userId && { userId }) }),
      );
      this.patientId.set(patient.id);
      this.pendingPatient = null;
    }
    const id = this.patientId();
    if (id && this.pendingMedicalHistory) {
      await firstValueFrom(this.patientsService.createMedicalHistory(id, this.pendingMedicalHistory));
      this.pendingMedicalHistory = null;
    }
  }

  protected async onStep4Submit(data: CreateDentalExamRequest): Promise<void> {
    const id = this.patientId();
    if (!id) { return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.patientsService.createDentalExam(id, data));
      this.done.set(true);
    } catch (err) {
      this.error.set(this.extractErrorMessage(err, 'Error al guardar el examen dental. Intente nuevamente.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected goBack(): void {
    const step = this.currentStep();
    if (step > 1) { this.currentStep.set(step - 1); }
  }

  protected onFinish(): void {
    this.wizardComplete.emit();
  }
}
