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
import type { CreateClinicalExamRequest } from '../../../../models/patient.request';

@Component({
  selector: 'app-step-clinical-exam',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-clinical-exam.html',
  styleUrl: './step-clinical-exam.scss',
})
export class StepClinicalExamComponent {
  readonly loading = input(false);
  readonly submitStep = output<CreateClinicalExamRequest>();
  readonly back = output<void>();

  protected readonly tartar = signal(false);
  protected readonly saburra = signal(false);
  protected readonly bacterialPlaque = signal(false);
  protected readonly halitosis = signal(false);
  // Texto libre a propósito (decisión clínica, no limpieza) — sin opciones
  // cerradas. Mínimo de 3 caracteres cuando hay contenido.
  protected readonly occlusion = field<string>('', (v: string) => optionalTextError(v, 200, 3));

  protected onSubmit(): void {
    touchAll(this.occlusion);
    if (!allValid(this.occlusion)) {
      return;
    }
    this.submitStep.emit({
      tartar: this.tartar(),
      saburra: this.saburra(),
      bacterialPlaque: this.bacterialPlaque(),
      halitosis: this.halitosis(),
      occlusion: normalizeText(this.occlusion.value()) || undefined,
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
