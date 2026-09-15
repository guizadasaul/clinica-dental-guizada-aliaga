import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { field, allValid, touchAll } from '../../../../../../shared/validation/field';
import { normalizeText, optionalTextError, requiredTextError } from '../../../../../../shared/validation/text.validator';
import { isNotFutureDate } from '../../../../../../shared/validation/date.validator';
import type { MedicalCondition } from '../../../../../medical-conditions/models/medical-condition.model';
import type { CreateMedicalHistoryRequest } from '../../../../models/patient.request';

interface ConditionDetail {
  diagnosedAt: string;
  notes: string;
}

interface MedicationRow {
  drugName: string;
  dose: string;
  frequency: string;
  startedAt: string;
}

function emptyMedicationRow(): MedicationRow {
  return { drugName: '', dose: '', frequency: '', startedAt: '' };
}

@Component({
  selector: 'app-step-medical-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-medical-history.html',
  styleUrl: './step-medical-history.scss',
})
export class StepMedicalHistoryComponent {
  readonly loading = input(false);
  /** Catálogo real de condiciones médicas (CLI-50) — agregar una condición nueva no requiere tocar este componente. */
  readonly catalog = input<MedicalCondition[]>([]);
  readonly submitStep = output<CreateMedicalHistoryRequest>();
  readonly back = output<void>();

  // Una entrada por condición MARCADA — el checkbox controla si la
  // condición está en el mapa, no un booleano propio (CLI-50: reemplaza los
  // 10 signals booleanos que había uno por condición fija).
  protected readonly conditionDetails = signal<Map<string, ConditionDetail>>(new Map());

  protected readonly medications = signal<MedicationRow[]>([]);

  // Mínimo de 3 caracteres cuando hay contenido — una sola letra o un solo
  // número no alcanzan como respuesta real (campo sigue siendo opcional).
  protected readonly otherDiseases = field<string>('', (v: string) => optionalTextError(v, 1000, 3));
  protected readonly gestationLmpDate = field<string>('', (v: string) => {
    if (!v) return null;
    return isNotFutureDate(v) ? null : 'La fecha no puede ser futura.';
  });
  protected readonly anesthesiaReactions = signal<boolean | null>(null);

  protected isConditionChecked(code: string): boolean {
    return this.conditionDetails().has(code);
  }

  protected toggleCondition(code: string, checked: boolean): void {
    this.conditionDetails.update((prev) => {
      const next = new Map(prev);
      if (checked) {
        next.set(code, { diagnosedAt: '', notes: '' });
      } else {
        next.delete(code);
      }
      return next;
    });
  }

  protected setConditionDetail(code: string, key: keyof ConditionDetail, value: string): void {
    this.conditionDetails.update((prev) => {
      const current = prev.get(code);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(code, { ...current, [key]: value });
      return next;
    });
  }

  protected addMedication(): void {
    this.medications.update((rows) => [...rows, emptyMedicationRow()]);
  }

  protected removeMedication(index: number): void {
    this.medications.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected updateMedication(index: number, key: keyof MedicationRow, value: string): void {
    this.medications.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }

  protected medicationDrugNameError(row: MedicationRow): string | null {
    // Una fila recién agregada y todavía vacía no es un error — solo lo es
    // si el doctor completó otro campo (dosis/frecuencia/fecha) y se olvidó
    // del nombre del fármaco.
    const touched = row.dose || row.frequency || row.startedAt;
    if (!touched) return null;
    return requiredTextError(row.drugName, 150, { minLength: 2 });
  }

  protected onSubmit(): void {
    touchAll(this.otherDiseases, this.gestationLmpDate);
    if (!allValid(this.otherDiseases, this.gestationLmpDate)) {
      return;
    }
    if (this.medications().some((row) => this.medicationDrugNameError(row))) {
      return;
    }

    const conditions = [...this.conditionDetails().entries()].map(([code, detail]) => ({
      code,
      diagnosedAt: detail.diagnosedAt || undefined,
      notes: normalizeText(detail.notes) || undefined,
    }));

    const medications = this.medications()
      .filter((row) => normalizeText(row.drugName) !== '')
      .map((row) => ({
        drugName: normalizeText(row.drugName),
        dose: normalizeText(row.dose) || undefined,
        frequency: normalizeText(row.frequency) || undefined,
        startedAt: row.startedAt || undefined,
      }));

    this.submitStep.emit({
      conditions,
      otherDiseases: normalizeText(this.otherDiseases.value()) || undefined,
      gestationLmpDate: this.gestationLmpDate.value() || undefined,
      anesthesiaReactions: this.anesthesiaReactions() ?? undefined,
      medications,
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
