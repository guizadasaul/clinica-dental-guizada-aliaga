import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  protected readonly occlusion = signal('');

  protected onSubmit(): void {
    this.submitStep.emit({
      tartar: this.tartar(),
      saburra: this.saburra(),
      bacterialPlaque: this.bacterialPlaque(),
      halitosis: this.halitosis(),
      occlusion: this.occlusion().trim() || undefined,
    });
  }

  protected onBack(): void {
    this.back.emit();
  }
}
