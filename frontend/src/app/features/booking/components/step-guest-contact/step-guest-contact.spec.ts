import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import type { GuestContactRequest } from '../../models/booking.request';
import { StepGuestContactComponent } from './step-guest-contact';

function setup() {
  TestBed.configureTestingModule({
    imports: [StepGuestContactComponent],
    providers: [provideTranslateService({ defaultLanguage: 'es' })],
  });
  return TestBed.createComponent(StepGuestContactComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitForm(fixture: ReturnType<typeof setup>): void {
  el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
}

async function settle(fixture: ReturnType<typeof setup>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
}

const FIRST_NAME_INPUT = '#guestFirstName';
const LAST_NAME_PATERNAL_INPUT = '#guestLastNamePaternal';
const LAST_NAME_MATERNAL_INPUT = '#guestLastNameMaternal';
const EMAIL_INPUT = '.guest-contact__input[type="email"]';
const PHONE_NATIONAL_INPUT = '.phone-input__national';
const ERROR = '.guest-contact__error';

function fillValidNames(fixture: ReturnType<typeof setup>): void {
  type(el(fixture, FIRST_NAME_INPUT), 'Juan');
  type(el(fixture, LAST_NAME_PATERNAL_INPUT), 'Claros');
}

describe('StepGuestContactComponent', () => {
  it('rechaza el envío con el nombre vacío', async () => {
    const fixture = setup();
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    // Sin loader de traducciones en el test, `translate.instant()` devuelve la
    // clave cruda — alcanza para verificar que se eligió la clave correcta por
    // motivo. La cobertura de que las claves EXISTEN en los 3 idiomas y con el
    // mismo texto está en el chequeo programático de es/en/pt.json, no acá.
    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.booking.guestContact.errors.firstNameEmpty',
    );
  });

  it('rechaza el envío con el apellido paterno vacío', async () => {
    const fixture = setup();
    await settle(fixture);

    type(el(fixture, FIRST_NAME_INPUT), 'Juan');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.booking.guestContact.errors.lastNamePaternalEmpty',
    );
  });

  // CLI-43: a diferencia del viejo fullName (≥2 palabras en un solo input),
  // cada campo acepta una sola palabra por su cuenta — "Juan" es un
  // firstName válido, ya no exige "nombre y apellido" en el mismo campo.
  it('acepta un nombre de una sola palabra en cada campo', async () => {
    const fixture = setup();
    await settle(fixture);

    fillValidNames(fixture);
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)).toBeNull();
  });

  it('rechaza un nombre con dígitos o símbolos ("solo puede tener letras")', async () => {
    const fixture = setup();
    await settle(fixture);

    type(el(fixture, FIRST_NAME_INPUT), 'Juan 123');
    type(el(fixture, LAST_NAME_PATERNAL_INPUT), 'Claros');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.booking.guestContact.errors.firstNameInvalid',
    );
  });

  it('rechaza un apellido materno inválido cuando se completa', async () => {
    const fixture = setup();
    await settle(fixture);

    fillValidNames(fixture);
    type(el(fixture, LAST_NAME_MATERNAL_INPUT), '123');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.booking.guestContact.errors.lastNameMaternalInvalid',
    );
  });

  it('rechaza el envío si el teléfono no es válido (todavía sin completar)', async () => {
    const fixture = setup();
    await settle(fixture);

    fillValidNames(fixture);
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.phone');
  });

  it('rechaza un correo con formato inválido, pero acepta vacío', async () => {
    const fixture = setup();
    await settle(fixture);

    fillValidNames(fixture);
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    type(el(fixture, EMAIL_INPUT), 'maria@correo.c');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.email');
  });

  it('emite el contacto con los nombres normalizados, el teléfono en E.164 y el correo en minúsculas', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: GuestContactRequest[] = [];
    fixture.componentInstance.submitContact.subscribe((value) => emitted.push(value));

    type(el(fixture, FIRST_NAME_INPUT), 'maria');
    type(el(fixture, LAST_NAME_PATERNAL_INPUT), 'garcia');
    type(el(fixture, LAST_NAME_MATERNAL_INPUT), 'lopez');
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    type(el(fixture, EMAIL_INPUT), 'MARIA@Correo.COM');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)).toBeNull();
    // Los nombres salen con mayúscula inicial por palabra, no como los tipeó
    // el visitante — se guardan siempre igual (ver normalizeFullName).
    expect(emitted).toEqual([
      {
        firstName: 'Maria',
        lastNamePaternal: 'Garcia',
        lastNameMaternal: 'Lopez',
        phone: '+59177842665',
        email: 'maria@correo.com',
      },
    ]);
  });

  it('acepta la reserva sin correo ni apellido materno (los dos son opcionales)', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: GuestContactRequest[] = [];
    fixture.componentInstance.submitContact.subscribe((value) => emitted.push(value));

    fillValidNames(fixture);
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toEqual([
      { firstName: 'Juan', lastNamePaternal: 'Claros', phone: '+59177842665' },
    ]);
  });
});
