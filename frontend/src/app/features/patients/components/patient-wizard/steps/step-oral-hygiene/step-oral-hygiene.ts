import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { field, allValid, touchAll } from '../../../../../../shared/validation/field';
import { normalizeText, optionalTextError } from '../../../../../../shared/validation/text.validator';
import { BRUSHING_FREQUENCIES, type BrushingFrequency } from '../../../../../../shared/validation/clinical-options';
import type { CreateHygieneHabitsRequest, CreateClinicalExamRequest } from '../../../../models/patient.request';

// Códigos estables del backend (ver clinical-options.ts) con su label visible
// en español — antes se guardaba directamente el texto con tildes. Exportado
// porque clinical-record-view (CLI-40) también lo necesita para el resumen.
export const BRUSHING_FREQUENCY_LABELS: Record<BrushingFrequency, string> = {
  once_daily: '1 vez al día',
  twice_daily: '2 veces al día',
  thrice_daily: '3 veces al día',
  more_than_thrice: 'Más de 3 veces al día',
  occasionally: 'Ocasionalmente',
};

/** Un solo paso ("Higiene bucal", CLI-40) que junta lo que antes eran dos pasos
 * separados (hábitos de higiene + examen clínico) — mismo par de POST al backend,
 * disparados juntos por patient-wizard.ts al enviar este paso. */
export interface OralHygieneSubmit {
  readonly hygieneHabits: CreateHygieneHabitsRequest;
  readonly clinicalExam: CreateClinicalExamRequest;
}

@Component({
  selector: 'app-step-oral-hygiene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-oral-hygiene.html',
  styleUrl: './step-oral-hygiene.scss',
})
export class StepOralHygieneComponent {
  readonly loading = input(false);
  readonly submitStep = output<OralHygieneSubmit>();
  readonly back = output<void>();

  protected readonly brushingFrequencyOptions = BRUSHING_FREQUENCIES.map((value) => ({
    value,
    label: BRUSHING_FREQUENCY_LABELS[value],
  }));

  // Hábitos de higiene
  protected readonly usesToothbrush = signal(false);
  // Obligatorio si usesToothbrush está marcado (regla cruzada, igual que el backend).
  protected readonly brushingFrequency = field<string>('', (v: string) => {
    if (!this.usesToothbrush()) return null;
    if (!v) return 'La frecuencia de cepillado es obligatoria si usás cepillo dental.';
    return null;
  });
  protected readonly usesDentalFloss = signal(false);
  protected readonly usesToothpick = signal(false);
  protected readonly brushesTongue = signal(false);
  protected readonly usesMouthwash = signal(false);

  // Examen clínico
  protected readonly tartar = signal(false);
  protected readonly saburra = signal(false);
  protected readonly bacterialPlaque = signal(false);
  protected readonly halitosis = signal(false);
  // Texto libre a propósito (decisión clínica, no limpieza) — sin opciones
  // cerradas. Mínimo de 3 caracteres cuando hay contenido.
  protected readonly occlusion = field<string>('', (v: string) => optionalTextError(v, 200, 3));

  protected onUsesToothbrushChange(checked: boolean): void {
    this.usesToothbrush.set(checked);
    if (!checked) {
      this.brushingFrequency.reset('');
    }
  }

  protected onSubmit(): void {
    touchAll(this.brushingFrequency, this.occlusion);
    if (!allValid(this.brushingFrequency, this.occlusion)) {
      return;
    }
    this.submitStep.emit({
      hygieneHabits: {
        usesToothbrush: this.usesToothbrush(),
        brushingFrequency: this.usesToothbrush() ? this.brushingFrequency.value() || undefined : undefined,
        usesDentalFloss: this.usesDentalFloss(),
        usesToothpick: this.usesToothpick(),
        brushesTongue: this.brushesTongue(),
        usesMouthwash: this.usesMouthwash(),
      },
      clinicalExam: {
        tartar: this.tartar(),
        saburra: this.saburra(),
        bacterialPlaque: this.bacterialPlaque(),
        halitosis: this.halitosis(),
        occlusion: normalizeText(this.occlusion.value()) || undefined,
      },
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
