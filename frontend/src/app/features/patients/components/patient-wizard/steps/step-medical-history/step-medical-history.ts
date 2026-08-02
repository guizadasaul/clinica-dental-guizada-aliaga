import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CreateMedicalHistoryRequest } from '../../../../models/patient.request';

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
  readonly submitStep = output<CreateMedicalHistoryRequest>();
  readonly back = output<void>();

  protected readonly hasAllergies = signal(false);
  protected readonly kidneyProblems = signal(false);
  protected readonly ulcers = signal(false);
  protected readonly rheumatism = signal(false);
  protected readonly heartProblems = signal(false);
  protected readonly diabetes = signal(false);
  protected readonly hypertension = signal(false);
  protected readonly hemorrhages = signal(false);
  protected readonly anemia = signal(false);
  protected readonly sti = signal(false);
  protected readonly otherDiseases = signal('');
  protected readonly gestationPeriod = signal('');
  protected readonly anesthesiaReactions = signal<boolean | null>(null);
  protected readonly currentMedications = signal('');

  protected onSubmit(): void {
    this.submitStep.emit({
      hasAllergies: this.hasAllergies(),
      kidneyProblems: this.kidneyProblems(),
      ulcers: this.ulcers(),
      rheumatism: this.rheumatism(),
      heartProblems: this.heartProblems(),
      diabetes: this.diabetes(),
      hypertension: this.hypertension(),
      hemorrhages: this.hemorrhages(),
      anemia: this.anemia(),
      sti: this.sti(),
      otherDiseases: this.otherDiseases().trim() || undefined,
      gestationPeriod: this.gestationPeriod().trim() || undefined,
      anesthesiaReactions: this.anesthesiaReactions() ?? undefined,
      currentMedications: this.currentMedications().trim() || undefined,
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
