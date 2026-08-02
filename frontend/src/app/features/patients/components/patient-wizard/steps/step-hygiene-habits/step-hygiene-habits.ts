import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CreateHygieneHabitsRequest } from '../../../../models/patient.request';

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

  protected readonly usesToothbrush = signal(false);
  protected readonly brushingFrequency = signal('');
  protected readonly usesDentalFloss = signal(false);
  protected readonly usesToothpick = signal(false);
  protected readonly brushesTongue = signal(false);
  protected readonly usesMouthwash = signal(false);

  protected onSubmit(): void {
    this.submitStep.emit({
      usesToothbrush: this.usesToothbrush(),
      brushingFrequency: this.usesToothbrush() ? (this.brushingFrequency().trim() || undefined) : undefined,
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
