import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { GuestContactRequest } from '../../models/booking.request';

@Component({
  selector: 'app-step-guest-contact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-guest-contact.html',
  styleUrl: './step-guest-contact.scss',
})
export class StepGuestContactComponent {
  readonly loading = input(false);
  readonly submitContact = output<GuestContactRequest>();

  protected readonly fullName = signal('');
  protected readonly phone = signal('');
  protected readonly formError = signal<string | null>(null);

  protected onSubmit(): void {
    const fullName = this.fullName().trim();
    const phone = this.phone().trim();
    if (fullName.length < 3) {
      this.formError.set('Ingresá tu nombre completo.');
      return;
    }
    if (!/^[0-9+\s-]{7,20}$/.test(phone)) {
      this.formError.set('Ingresá un número de teléfono válido.');
      return;
    }
    this.formError.set(null);
    this.submitContact.emit({ fullName, phone });
  }
}
