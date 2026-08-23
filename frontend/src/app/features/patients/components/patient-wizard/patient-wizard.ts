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
import { StepPatientDataComponent } from './steps/step-patient-data/step-patient-data';
import { StepMedicalHistoryComponent } from './steps/step-medical-history/step-medical-history';
import { StepHygieneHabitsComponent } from './steps/step-hygiene-habits/step-hygiene-habits';
import { StepClinicalExamComponent } from './steps/step-clinical-exam/step-clinical-exam';
import { StepOdontogramComponent } from './steps/step-odontogram/step-odontogram';
import type { OdontogramEntry } from '../../models/patient.model';
import type {
  CreatePatientRequest,
  CreateMedicalHistoryRequest,
  CreateHygieneHabitsRequest,
  CreateClinicalExamRequest,
  CreateOdontogramEntryRequest,
} from '../../models/patient.request';

interface WizardStep {
  readonly number: number;
  readonly label: string;
}

const STEPS: WizardStep[] = [
  { number: 1, label: 'Datos del paciente' },
  { number: 2, label: 'Historial médico' },
  { number: 3, label: 'Hábitos de higiene' },
  { number: 4, label: 'Examen clínico' },
  { number: 5, label: 'Odontograma' },
];

@Component({
  selector: 'app-patient-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StepPatientDataComponent,
    StepMedicalHistoryComponent,
    StepHygieneHabitsComponent,
    StepClinicalExamComponent,
    StepOdontogramComponent,
  ],
  templateUrl: './patient-wizard.html',
  styleUrl: './patient-wizard.scss',
})
export class PatientWizardComponent {
  private readonly patientsService = inject(PatientsService);

  readonly userId = input('');
  readonly existingPatientId = input<string | null>(null);
  /** Paso donde arranca al editar un paciente existente — 5 (odontograma) por defecto. La agenda del doctor pasa 2 para abrir el historial clínico completo. */
  readonly startStep = input(5);
  readonly wizardComplete = output<void>();
  readonly cancel = output<void>();

  protected readonly steps = STEPS;
  protected readonly currentStep = signal(1);
  protected readonly patientId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

  protected readonly isEditMode = computed(() => !!this.existingPatientId());
  protected readonly wizardTitle = computed(() => {
    if (!this.isEditMode()) {
      return 'Registro de nuevo paciente';
    }
    if (this.startStep() === 5) {
      return 'Completar odontograma';
    }
    if (this.startStep() === 1) {
      return 'Registrar diagnóstico';
    }
    return 'Completar historial clínico';
  });

  protected readonly existingOdontogramEntries = signal<OdontogramEntry[]>([]);

  constructor() {
    effect(() => {
      const existingId = this.existingPatientId();
      if (existingId) {
        this.patientId.set(existingId);
        this.currentStep.set(this.startStep());
        void this.loadOdontogramEntries(existingId);
      }
    }, { allowSignalWrites: true });
  }

  private async loadOdontogramEntries(patientId: string): Promise<void> {
    try {
      const entries = await firstValueFrom(this.patientsService.getOdontogramEntries(patientId));
      this.existingOdontogramEntries.set(entries);
    } catch {
      // no-op: component starts with empty entries (all-sano defaults)
    }
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
    } catch {
      this.error.set('Error al guardar los datos del paciente. Intente nuevamente.');
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
    } catch {
      this.error.set('Error al guardar el historial médico. Intente nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onStep3Submit(data: CreateHygieneHabitsRequest): Promise<void> {
    const id = this.patientId();
    if (!id) { return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.patientsService.createHygieneHabits(id, data));
      this.currentStep.set(4);
    } catch {
      this.error.set('Error al guardar los hábitos de higiene. Intente nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onStep4Submit(data: CreateClinicalExamRequest): Promise<void> {
    const id = this.patientId();
    if (!id) { return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.patientsService.createClinicalExam(id, data));
      this.currentStep.set(5);
    } catch {
      this.error.set('Error al guardar el examen clínico. Intente nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onStep5Submit(entries: CreateOdontogramEntryRequest[]): Promise<void> {
    const id = this.patientId();
    if (!id) { return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      if (entries.length > 0) {
        await firstValueFrom(this.patientsService.createOdontogramEntries(id, { entries }));
      }
      this.done.set(true);
    } catch {
      this.error.set('Error al guardar el odontograma. Intente nuevamente.');
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
