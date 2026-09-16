import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import type { Doctor } from '../../models/booking.model';

@Component({
  selector: 'app-doctor-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './doctor-picker.html',
  styleUrl: './doctor-picker.scss',
})
export class DoctorPickerComponent {
  readonly doctors = input<Doctor[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  readonly doctorSelected = output<string>();

  protected select(doctorId: string): void {
    this.doctorSelected.emit(doctorId);
  }
}
