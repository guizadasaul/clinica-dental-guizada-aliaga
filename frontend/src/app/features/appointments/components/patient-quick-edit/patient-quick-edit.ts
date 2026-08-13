import { Component, ChangeDetectionStrategy, effect, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../../patients/services/patients.service';

@Component({
  selector: 'app-patient-quick-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './patient-quick-edit.html',
  styleUrl: './patient-quick-edit.scss',
})
export class PatientQuickEditComponent {
  private readonly patientsService = inject(PatientsService);

  readonly patientId = input.required<string>();
  readonly initialFirstName = input('');
  readonly initialLastNamePaternal = input('');
  readonly initialPhone = input<string | null>(null);
  readonly saved = output<void>();
  readonly cancel = output<void>();

  protected readonly firstName = signal('');
  protected readonly lastNamePaternal = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(
      () => {
        this.firstName.set(this.initialFirstName());
        this.lastNamePaternal.set(this.initialLastNamePaternal());
        this.phone.set(this.initialPhone() ?? '');
      },
      { allowSignalWrites: true },
    );
  }

  protected async onSubmit(): Promise<void> {
    if (!this.firstName().trim() || !this.lastNamePaternal().trim()) {
      this.error.set('Nombre y apellido paterno son obligatorios.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.patientsService.updatePatient(this.patientId(), {
          firstName: this.firstName().trim(),
          lastNamePaternal: this.lastNamePaternal().trim(),
          phone: this.phone().trim() || undefined,
          email: this.email().trim() || undefined,
        }),
      );
      this.saved.emit();
    } catch {
      this.error.set('No pudimos guardar los cambios. Intentá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
