import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  effect,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { TreatmentsService } from '../../services/treatments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import type { Treatment, ToothProcedure } from '../../models/treatment.model';
import type { DentalExam } from '../../../patients/models/dental-exam.model';
import type { DiagnosisCategory } from '../../../diagnoses/models/diagnosis.model';
import {
  RegisterTreatmentOdontogramComponent,
  type ProcedureRegisteredEvent,
} from '../register-treatment-odontogram/register-treatment-odontogram';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-register-treatment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, RegisterTreatmentOdontogramComponent],
  templateUrl: './register-treatment.html',
  styleUrl: './register-treatment.scss',
})
export class RegisterTreatmentComponent {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly patientsService = inject(PatientsService);
  private readonly diagnosesService = inject(DiagnosesService);

  readonly patientId = input.required<string>();
  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly treatments = toSignal(
    this.treatmentsService.getAll(),
    { initialValue: [] as Treatment[] },
  );

  /** Los que más usa el doctor — atajo "Frecuentes" del selector (CLI-118); vacío si falla. */
  protected readonly frequentTreatmentIds = toSignal(
    this.treatmentsService.getFrequentIds().pipe(catchError(() => of([] as string[]))),
    { initialValue: [] as string[] },
  );

  protected readonly diagnosisCatalog = toSignal(
    this.diagnosesService.getCatalog(),
    { initialValue: [] as DiagnosisCategory[] },
  );

  /** Última versión del diagnóstico del paciente — el odontograma de tratamientos parte de acá (CLI-41). */
  protected readonly currentExam = signal<DentalExam | null>(null);
  protected readonly registeredProcedures = signal<ToothProcedure[]>([]);
  protected readonly successMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.patientId();
      if (!id) { return; }
      this.patientsService.getCurrentDentalExam(id).subscribe({
        next: (exam) => this.currentExam.set(exam),
        error: () => {},
      });
      this.treatmentsService.getToothProcedures(id).subscribe({
        next: (procedures) => this.registeredProcedures.set(procedures),
        error: () => {},
      });
    });
  }

  protected onProcedureRegistered(event: ProcedureRegisteredEvent): void {
    this.registeredProcedures.update((prev) => [...prev, ...event.procedures]);
    this.successMessage.set(event.message);
  }

  protected getTreatmentName(treatmentId: string): string {
    return this.treatments().find((t) => t.id === treatmentId)?.name ?? treatmentId;
  }

  protected getTreatmentCurrencySymbol(treatmentId: string): string {
    const t = this.treatments().find((t) => t.id === treatmentId);
    return t?.currency === 'USD' ? '$' : 'Bs.';
  }

  protected onClose(): void {
    this.cancelled.emit();
  }

  protected onFinish(): void {
    this.done.emit();
  }
}
