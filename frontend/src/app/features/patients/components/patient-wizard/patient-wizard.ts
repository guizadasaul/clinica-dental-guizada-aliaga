import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import { MedicalConditionsService } from '../../../medical-conditions/services/medical-conditions.service';
import { StepPatientDataComponent } from './steps/step-patient-data/step-patient-data';
import { StepMedicalHistoryComponent } from './steps/step-medical-history/step-medical-history';
import { StepOralHygieneComponent } from './steps/step-oral-hygiene/step-oral-hygiene';
import type { OralHygieneSubmit } from './steps/step-oral-hygiene/step-oral-hygiene';
import { StepOdontogramComponent, type DentalExamMode } from './steps/step-odontogram/step-odontogram';
import type { Patient } from '../../models/patient.model';
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
export class PatientWizardComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly diagnosesService = inject(DiagnosesService);
  private readonly medicalConditionsService = inject(MedicalConditionsService);

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
  readonly cancel = output<void>();

  protected readonly steps = STEPS;
  protected readonly currentStep = signal(1);
  protected readonly patientId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

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
  protected readonly medicalConditionsCatalog = signal<MedicalCondition[]>([]);
  protected readonly currentDentalExam = signal<DentalExam | null>(null);
  protected readonly dentalExamVersions = signal<DentalExamVersionSummary[]>([]);
  protected readonly viewedDentalExam = signal<DentalExam | null>(null);

  constructor() {
    void this.loadDiagnosisCatalog();
    void this.loadMedicalConditionsCatalog();
    effect(() => {
      const existingId = this.existingPatientId();
      if (existingId) {
        this.patientId.set(existingId);
        this.currentStep.set(this.startStep());
        void this.loadDentalExam(existingId);
      }
    }, { allowSignalWrites: true });
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

  protected async onViewDentalExamVersion(examId: string): Promise<void> {
    const id = this.patientId();
    if (!id) { return; }
    try {
      const exam = await firstValueFrom(this.patientsService.getDentalExam(id, examId));
      this.viewedDentalExam.set(exam);
    } catch {
      // no-op
    }
  }

  protected onCloseViewedDentalExam(): void {
    this.viewedDentalExam.set(null);
  }

  /**
   * class-validator devuelve el 400 como `{ message: string | string[], ... }`
   * (un string por regla que falló). Antes los 5 `catch` se comían ese detalle
   * y mostraban siempre el mismo mensaje genérico, incluso para un DNI
   * duplicado (409) o una fecha futura (400) — ahora se muestra lo que mandó
   * el backend, y solo se cae al genérico si la respuesta no trae nada usable.
   */
  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const body = (err as { error?: unknown }).error;
      if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
        if (Array.isArray(message)) {
          const lines = message.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
          if (lines.length > 0) {
            return lines.join(' ');
          }
        }
      }
    }
    return fallback;
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  protected async onStep1Submit(data: Omit<CreatePatientRequest, 'userId'>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const existingId = this.existingPatientId();
      const patient = await firstValueFrom(
        existingId
          ? this.patientsService.updatePatient(existingId, data)
          : this.patientsService.createPatient({ ...data, userId: this.userId() }),
      );
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
    if (!id) { return; }
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
    const id = this.patientId();
    if (!id) { return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        firstValueFrom(this.patientsService.createHygieneHabits(id, data.hygieneHabits)),
        firstValueFrom(this.patientsService.createClinicalExam(id, data.clinicalExam)),
      ]);
      this.currentStep.set(4);
    } catch (err) {
      this.error.set(this.extractErrorMessage(err, 'Error al guardar la higiene bucal. Intente nuevamente.'));
    } finally {
      this.loading.set(false);
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
