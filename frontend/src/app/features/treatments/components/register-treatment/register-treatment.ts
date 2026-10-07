import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
import { QuotesService } from '../../../quotes/services/quotes.service';
import { pendingPlanLines, type PlanLine } from '../../../quotes/utils/treatment-plan';

/** Una aplicación de un tratamiento: un diente, varios dientes juntos o ninguno. */
interface RegisteredGroup {
  readonly key: string;
  readonly toothNumbers: number[];
  readonly treatmentId: string;
  readonly totalPrice: number;
}

@Component({
  selector: 'app-register-treatment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, RegisterTreatmentOdontogramComponent, DecimalPipe],
  templateUrl: './register-treatment.html',
  styleUrl: './register-treatment.scss',
})
export class RegisterTreatmentComponent {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly patientsService = inject(PatientsService);
  private readonly diagnosesService = inject(DiagnosesService);
  private readonly quotesService = inject(QuotesService);
  private readonly odontogram = viewChild<RegisterTreatmentOdontogramComponent>('odontogram');

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
  /** CLI-228: lo que falta realizar del presupuesto — el plan que el doctor cumple. */
  protected readonly planLines = signal<PlanLine[]>([]);

  /**
   * Un tratamiento de varios dientes se guarda como una fila por diente con
   * el mismo applicationGroupId (precio completo en una, 0 en las demás). Se
   * muestra en una sola línea con el precio una vez, como en el historial
   * (CLI-180): antes cada diente parecía un cobro aparte.
   */
  protected readonly registeredGroups = computed<RegisteredGroup[]>(() => {
    const groups = new Map<string, ToothProcedure[]>();
    for (const p of this.registeredProcedures()) {
      const key = p.applicationGroupId ?? p.id;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups].map(([key, rows]) => ({
      key,
      toothNumbers: rows.map((r) => r.toothNumber).filter((n): n is number => n !== null),
      treatmentId: rows[0].treatmentId,
      // Las filas de un grupo reportan el precio del grupo (CLI-53): va una vez.
      totalPrice: rows[0].applicationGroupId
        ? rows[0].priceCharged
        : rows.reduce((sum, r) => sum + r.priceCharged, 0),
    }));
  });

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
      this.loadPlan(id);
    });
  }

  /** Sin presupuesto (o si falla) no hay plan: se registra igual y se suma solo. */
  private loadPlan(patientId: string): void {
    this.quotesService.getByPatient(patientId).subscribe({
      next: (quotes) => this.planLines.set(pendingPlanLines(quotes)),
      error: () => this.planLines.set([]),
    });
  }

  protected onProcedureRegistered(event: ProcedureRegisteredEvent): void {
    this.registeredProcedures.update((prev) => [...prev, ...event.procedures]);
    this.successMessage.set(event.message);
    this.loadPlan(this.patientId());
  }

  protected onPlanLineClick(line: PlanLine): void {
    this.successMessage.set(null);
    this.odontogram()?.openForPlanLine(line);
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
