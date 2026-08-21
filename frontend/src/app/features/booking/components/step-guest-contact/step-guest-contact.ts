import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import {
  type NameValidationError,
  normalizeFullName,
  validateFullName,
} from '../../../../shared/validation/full-name.validator';
import { isValidEmail, normalizeEmail } from '../../../../shared/validation/email.validator';
import type { GuestContactRequest } from '../../models/booking.request';

const NAME_ERROR_KEYS: Record<Exclude<NameValidationError, null>, string> = {
  empty: 'nameEmpty',
  'single-word': 'nameSingleWord',
  'invalid-chars': 'nameInvalidChars',
  'too-long': 'nameTooLong',
};

@Component({
  selector: 'app-step-guest-contact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, PhoneInputComponent],
  templateUrl: './step-guest-contact.html',
  styleUrl: './step-guest-contact.scss',
})
export class StepGuestContactComponent {
  private readonly translate = inject(TranslateService);

  readonly loading = input(false);
  readonly submitContact = output<GuestContactRequest>();

  protected readonly fullName = signal('');
  protected readonly phoneE164 = signal('');
  protected readonly phoneValid = signal(false);
  protected readonly email = signal('');
  protected readonly formError = signal<string | null>(null);

  protected onPhoneChanged(event: { e164: string; valid: boolean }): void {
    this.phoneE164.set(event.e164);
    this.phoneValid.set(event.valid);
  }

  protected onSubmit(): void {
    const nameError = validateFullName(this.fullName());
    if (nameError) {
      this.formError.set(
        this.translate.instant(`landing.booking.guestContact.errors.${NAME_ERROR_KEYS[nameError]}`),
      );
      return;
    }

    if (!this.phoneValid()) {
      this.formError.set(this.translate.instant('landing.booking.guestContact.errors.phone'));
      return;
    }

    const email = this.email().trim();
    if (email && !isValidEmail(email)) {
      this.formError.set(this.translate.instant('landing.booking.guestContact.errors.email'));
      return;
    }

    this.formError.set(null);
    this.submitContact.emit({
      fullName: normalizeFullName(this.fullName()),
      phone: this.phoneE164(),
      ...(email && { email: normalizeEmail(email) }),
    });
  }
}
