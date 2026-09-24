import { Component, ChangeDetectionStrategy, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PhoneInputComponent } from '../../../../shared/ui/phone-input/phone-input';
import {
  type NameValidationError,
  normalizeFullName,
  validatePersonName,
} from '../../../../shared/validation/full-name.validator';
import { isValidEmail, normalizeEmail } from '../../../../shared/validation/email.validator';
import type { GuestContactRequest } from '../../models/booking.request';

type NameField = 'firstName' | 'lastNamePaternal' | 'lastNameMaternal';

/** Clave de i18n del error de un campo de nombre (el largo es común a los tres). */
function nameErrorKey(field: NameField, error: NameValidationError): string {
  if (error === 'too-long') {
    return 'nameTooLong';
  }
  return error === 'empty' ? `${field}Empty` : `${field}Invalid`;
}

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

  protected readonly firstName = signal('');
  protected readonly lastNamePaternal = signal('');
  protected readonly lastNameMaternal = signal('');
  protected readonly phoneE164 = signal('');
  protected readonly phoneValid = signal(false);
  protected readonly email = signal('');
  protected readonly formError = signal<string | null>(null);

  protected onPhoneChanged(event: { e164: string; valid: boolean }): void {
    this.phoneE164.set(event.e164);
    this.phoneValid.set(event.valid);
  }

  // validatePersonName (una palabra alcanza) por campo, en vez del
  // validateFullName de antes (≥2 palabras en un solo input) — CLI-43: ahora
  // nombre y apellido paterno son dos campos separados, cada uno obligatorio
  // por su cuenta, y el materno es opcional.
  private nameErrorMessage(field: NameField, error: NameValidationError): string {
    return this.translate.instant(`landing.booking.guestContact.errors.${nameErrorKey(field, error)}`);
  }

  protected onSubmit(): void {
    const firstNameError = validatePersonName(this.firstName());
    if (firstNameError) {
      this.formError.set(this.nameErrorMessage('firstName', firstNameError));
      return;
    }

    const lastNamePaternalError = validatePersonName(this.lastNamePaternal());
    if (lastNamePaternalError) {
      this.formError.set(this.nameErrorMessage('lastNamePaternal', lastNamePaternalError));
      return;
    }

    const lastNameMaternal = this.lastNameMaternal().trim();
    if (lastNameMaternal) {
      const lastNameMaternalError = validatePersonName(lastNameMaternal);
      if (lastNameMaternalError) {
        this.formError.set(this.nameErrorMessage('lastNameMaternal', lastNameMaternalError));
        return;
      }
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
      firstName: normalizeFullName(this.firstName()),
      lastNamePaternal: normalizeFullName(this.lastNamePaternal()),
      ...(lastNameMaternal && { lastNameMaternal: normalizeFullName(lastNameMaternal) }),
      phone: this.phoneE164(),
      ...(email && { email: normalizeEmail(email) }),
    });
  }
}
