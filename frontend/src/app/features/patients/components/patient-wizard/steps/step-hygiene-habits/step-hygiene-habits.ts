import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { field, allValid, touchAll } from '../../../../../../shared/validation/field';
import { BRUSHING_FREQUENCIES, type BrushingFrequency } from '../../../../../../shared/validation/clinical-options';
import type { CreateHygieneHabitsRequest } from '../../../../models/patient.request';

// Códigos estables del backend (ver clinical-options.ts) con su label visible
// en español — antes se guardaba directamente el texto con tildes.
const BRUSHING_FREQUENCY_LABELS: Record<BrushingFrequency, string> = {
  once_daily: '1 vez al día',
  twice_daily: '2 veces al día',
  thrice_daily: '3 veces al día',
  more_than_thrice: 'Más de 3 veces al día',
  occasionally: 'Ocasionalmente',
};

@Component({
  selector: 'app-step-hygiene-habits',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-hygiene-habits.html',
  styleUrl: './step-hygiene-habits.scss',
})
export class StepHygieneHabitsComponent {
  readonly loading = input(false);
  readonly submitStep = output<CreateHygieneHabitsRequest>();
  readonly back = output<void>();

  protected readonly brushingFrequencyOptions = BRUSHING_FREQUENCIES.map((value) => ({
    value,
    label: BRUSHING_FREQUENCY_LABELS[value],
  }));

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

  protected onUsesToothbrushChange(checked: boolean): void {
    this.usesToothbrush.set(checked);
    if (!checked) {
      this.brushingFrequency.reset('');
    }
  }

  protected onSubmit(): void {
    touchAll(this.brushingFrequency);
    if (!allValid(this.brushingFrequency)) {
      return;
    }
    this.submitStep.emit({
      usesToothbrush: this.usesToothbrush(),
      brushingFrequency: this.usesToothbrush() ? this.brushingFrequency.value() || undefined : undefined,
      usesDentalFloss: this.usesDentalFloss(),
      usesToothpick: this.usesToothpick(),
      brushesTongue: this.brushesTongue(),
      usesMouthwash: this.usesMouthwash(),
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
