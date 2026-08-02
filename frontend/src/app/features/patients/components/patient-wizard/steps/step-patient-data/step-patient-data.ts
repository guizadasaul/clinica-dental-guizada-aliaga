import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CreatePatientRequest } from '../../../../models/patient.request';

@Component({
  selector: 'app-step-patient-data',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-patient-data.html',
  styleUrl: './step-patient-data.scss',
})
export class StepPatientDataComponent {
  readonly loading = input(false);
  readonly submitStep = output<Omit<CreatePatientRequest, 'userId'>>();

  protected readonly firstName = signal('');
  protected readonly lastNamePaternal = signal('');
  protected readonly lastNameMaternal = signal('');
  protected readonly birthDate = signal('');
  protected readonly birthPlace = signal('');
  protected readonly sex = signal('');
  protected readonly occupation = signal('');
  protected readonly address = signal('');
  protected readonly phone = signal('');
  protected readonly dni = signal('');
  protected readonly emergencyContactName = signal('');
  protected readonly emergencyContactPhone = signal('');
  protected readonly emergencyContactRelationship = signal('');
  protected readonly consultationReason = signal('');
  protected readonly lastDentistVisit = signal('');
  protected readonly lastVisitTreatment = signal('');
  protected readonly familyHistory = signal('');

  protected readonly formError = signal<string | null>(null);

  protected onSubmit(): void {
    if (!this.firstName().trim() || !this.lastNamePaternal().trim() || !this.birthDate()) {
      this.formError.set('Nombre, apellido paterno y fecha de nacimiento son obligatorios.');
      return;
    }
    this.formError.set(null);
    this.submitStep.emit({
      firstName: this.firstName().trim(),
      lastNamePaternal: this.lastNamePaternal().trim(),
      lastNameMaternal: this.lastNameMaternal().trim() || undefined,
      birthDate: this.birthDate(),
      birthPlace: this.birthPlace().trim() || undefined,
      sex: this.sex() || undefined,
      occupation: this.occupation().trim() || undefined,
      address: this.address().trim() || undefined,
      phone: this.phone().trim() || undefined,
      dni: this.dni().trim() || undefined,
      emergencyContactName: this.emergencyContactName().trim() || undefined,
      emergencyContactPhone: this.emergencyContactPhone().trim() || undefined,
      emergencyContactRelationship: this.emergencyContactRelationship().trim() || undefined,
      consultationReason: this.consultationReason().trim() || undefined,
      lastDentistVisit: this.lastDentistVisit() || undefined,
      lastVisitTreatment: this.lastVisitTreatment().trim() || undefined,
      familyHistory: this.familyHistory().trim() || undefined,
    });
  }
}
