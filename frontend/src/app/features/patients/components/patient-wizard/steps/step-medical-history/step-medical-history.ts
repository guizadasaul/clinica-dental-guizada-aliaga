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
  // Mínimo de 3 caracteres cuando hay contenido — una sola letra o un solo
  // número no alcanzan como respuesta real (campos siguen siendo opcionales).
  protected readonly otherDiseases = field<string>('', (v: string) => optionalTextError(v, 1000, 3));
  protected readonly gestationPeriod = field<string>('', (v: string) => optionalTextError(v, 100, 3));
  protected readonly anesthesiaReactions = signal<boolean | null>(null);
  protected readonly currentMedications = field<string>('', (v: string) => optionalTextError(v, 1000, 3));

  protected onSubmit(): void {
    touchAll(this.otherDiseases, this.gestationPeriod, this.currentMedications);
    if (!allValid(this.otherDiseases, this.gestationPeriod, this.currentMedications)) {
      return;
    }
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
      otherDiseases: normalizeText(this.otherDiseases.value()) || undefined,
      gestationPeriod: normalizeText(this.gestationPeriod.value()) || undefined,
      anesthesiaReactions: this.anesthesiaReactions() ?? undefined,
      currentMedications: normalizeText(this.currentMedications.value()) || undefined,
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
