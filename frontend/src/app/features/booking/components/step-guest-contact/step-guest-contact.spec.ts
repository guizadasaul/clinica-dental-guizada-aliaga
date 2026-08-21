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

const NAME_INPUT = '.guest-contact__input[type="text"]';
const EMAIL_INPUT = '.guest-contact__input[type="email"]';
const PHONE_NATIONAL_INPUT = '.phone-input__national';
const ERROR = '.guest-contact__error';

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
    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.nameEmpty');
  });

  it('rechaza un nombre de una sola palabra ("necesitamos nombre y apellido")', async () => {
    const fixture = setup();
    await settle(fixture);

    type(el(fixture, NAME_INPUT), 'juan');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.nameSingleWord');
  });

  it('rechaza un nombre con dígitos o símbolos ("solo puede tener letras")', async () => {
    const fixture = setup();
    await settle(fixture);

    type(el(fixture, NAME_INPUT), 'Juan 123');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.nameInvalidChars');
  });

  it('rechaza el envío si el teléfono no es válido (todavía sin completar)', async () => {
    const fixture = setup();
    await settle(fixture);

    type(el(fixture, NAME_INPUT), 'Juan Claros');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.phone');
  });

  it('rechaza un correo con formato inválido, pero acepta vacío', async () => {
    const fixture = setup();
    await settle(fixture);

    type(el(fixture, NAME_INPUT), 'Juan Claros');
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    type(el(fixture, EMAIL_INPUT), 'maria@correo.c');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain('landing.booking.guestContact.errors.email');
  });

  it('emite el contacto con el nombre normalizado, el teléfono en E.164 y el correo en minúsculas', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: GuestContactRequest[] = [];
    fixture.componentInstance.submitContact.subscribe((value) => emitted.push(value));

    type(el(fixture, NAME_INPUT), 'maria  garcia');
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    type(el(fixture, EMAIL_INPUT), 'MARIA@Correo.COM');
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)).toBeNull();
    // El nombre sale con mayúscula inicial por palabra, no como lo tipeó el
    // visitante — se guarda siempre igual (ver normalizeFullName).
    expect(emitted).toEqual([
      { fullName: 'Maria Garcia', phone: '+59177842665', email: 'maria@correo.com' },
    ]);
  });

  it('acepta la reserva sin correo (es opcional)', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: GuestContactRequest[] = [];
    fixture.componentInstance.submitContact.subscribe((value) => emitted.push(value));

    type(el(fixture, NAME_INPUT), 'Juan Claros');
    type(el<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUT), '77842665');
    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toEqual([{ fullName: 'Juan Claros', phone: '+59177842665' }]);
  });
});
