import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import type { CreatePatientRequest } from '../../../../models/patient.request';
import type { Patient } from '../../../../models/patient.model';
import { StepPatientDataComponent } from './step-patient-data';

function setup() {
  TestBed.configureTestingModule({
    imports: [StepPatientDataComponent],
    providers: [provideTranslateService({ defaultLanguage: 'es' })],
  });
  return TestBed.createComponent(StepPatientDataComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function elAll<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector)) as T[];
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function select(sel: HTMLSelectElement, value: string): void {
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
}

function submitForm(fixture: ReturnType<typeof setup>): void {
  el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
}

async function settle(fixture: ReturnType<typeof setup>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
}

const FIRST_NAME = '#firstName';
const LAST_NAME_PATERNAL = '#lastNamePaternal';
const BIRTH_DATE = '#birthDate';
const BIRTH_PLACE = '#birthPlace';
const SEX = '#sex';
const OCCUPATION = '#occupation';
const DNI = '#dni';
const ADDRESS = '#address';
const EMERGENCY_CONTACT_NAME = '#emergencyContactName';
const EMERGENCY_CONTACT_RELATIONSHIP = '#emergencyContactRelationship';
// Hay dos <app-phone-input> en el formulario: teléfono del paciente primero,
// teléfono del contacto de emergencia después — mismo orden que en el DOM.
const PHONE_NATIONAL_INPUTS = '.phone-input__national';

function pastIsoDate(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function futureIsoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Completa todos los campos obligatorios del step con datos válidos. */
function fillRequiredFields(fixture: ReturnType<typeof setup>): void {
  type(el(fixture, FIRST_NAME), 'Juan');
  type(el(fixture, LAST_NAME_PATERNAL), 'Perez');
  type(el<HTMLInputElement>(fixture, BIRTH_DATE), pastIsoDate(30));
  type(el(fixture, BIRTH_PLACE), 'La Paz');
  select(el<HTMLSelectElement>(fixture, SEX), 'masculino');
  type(el(fixture, OCCUPATION), 'Ingeniero');
  type(el(fixture, DNI), '12345678');
  type(el(fixture, ADDRESS), 'Av. Siempre Viva 123');
  type(el(fixture, EMERGENCY_CONTACT_NAME), 'Maria Perez');
  type(el(fixture, EMERGENCY_CONTACT_RELATIONSHIP), 'Madre');
  const [, emergencyPhoneNational] = elAll<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUTS);
  type(emergencyPhoneNational, '77777777');
}

describe('StepPatientDataComponent', () => {
  it('marca en rojo los campos obligatorios vacíos al enviar, sin emitir', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: unknown[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, `${FIRST_NAME}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${LAST_NAME_PATERNAL}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${BIRTH_DATE}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${BIRTH_PLACE}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${OCCUPATION}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${DNI}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${ADDRESS}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${EMERGENCY_CONTACT_NAME}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, `${EMERGENCY_CONTACT_RELATIONSHIP}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, '#firstName-err')?.textContent).toContain('El nombre es obligatorio.');
    expect(el(fixture, '#dni-err')?.textContent).toContain('El DNI es obligatorio.');
  });

  it('rechaza una fecha de nacimiento futura sin llegar a emitir', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: unknown[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    type(el(fixture, FIRST_NAME), 'Juan');
    type(el(fixture, LAST_NAME_PATERNAL), 'Perez');
    type(el<HTMLInputElement>(fixture, BIRTH_DATE), futureIsoDate(1));
    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, '#birthDate-err')?.textContent).toContain('La fecha no puede ser futura.');
  });

  // Campos que pasaron a obligatorios: sin ellos, el submit no emite aunque
  // nombre/apellido/fecha de nacimiento estén completos.
  it('no emite si falta algún campo recién vuelto obligatorio (ej. DNI)', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: unknown[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    fillRequiredFields(fixture);
    type(el(fixture, DNI), ''); // el único que queda vacío
    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, `${DNI}.step-form__input--invalid`)).toBeTruthy();
  });

  // Mínimo de 3 caracteres: una sola letra o un solo número ya no alcanzan.
  it('rechaza un campo de texto libre con menos de 3 caracteres', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: unknown[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    fillRequiredFields(fixture);
    type(el(fixture, OCCUPATION), 'A1');
    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, `${OCCUPATION}.step-form__input--invalid`)).toBeTruthy();
    expect(el(fixture, '#occupation-err')?.textContent).toContain('al menos 3 caracteres');
  });

  it(
    'aserción central: normaliza nombre, DNI y teléfono al emitir ' +
      '("  aDrIaN   mercado " + "12.345.678" + "77842665" → Adrian Mercado / 12345678 / +59177842665)',
    async () => {
      const fixture = setup();
      await settle(fixture);

      const emitted: Omit<CreatePatientRequest, 'userId'>[] = [];
      fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

      fillRequiredFields(fixture);
      type(el(fixture, FIRST_NAME), '  aDrIaN   mercado ');
      type(el(fixture, LAST_NAME_PATERNAL), 'Claros');
      type(el(fixture, DNI), '12.345.678');
      const [patientPhoneNational] = elAll<HTMLInputElement>(fixture, PHONE_NATIONAL_INPUTS);
      type(patientPhoneNational, '77842665');
      submitForm(fixture);
      await settle(fixture);

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        firstName: 'Adrian Mercado',
        dni: '12345678',
        phone: '+59177842665',
      });
    },
  );

  it('acepta el envío con los obligatorios completos y los opcionales vacíos', async () => {
    const fixture = setup();
    await settle(fixture);

    const emitted: Omit<CreatePatientRequest, 'userId'>[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    fillRequiredFields(fixture);
    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      firstName: 'Juan',
      lastNamePaternal: 'Perez',
      lastNameMaternal: undefined,
      birthDate: pastIsoDate(30),
      birthPlace: 'La Paz',
      sex: 'masculino',
      occupation: 'Ingeniero',
      address: 'Av. Siempre Viva 123',
      phone: undefined,
      dni: '12345678',
      emergencyContactName: 'Maria Perez',
      emergencyContactPhone: '+59177777777',
      emergencyContactRelationship: 'Madre',
      consultationReason: undefined,
      lastDentistVisit: undefined,
      lastVisitTreatment: undefined,
      familyHistory: undefined,
    });
  });

  it('precarga los campos con el paciente existente (modo edición)', async () => {
    const fixture = setup();
    const patient: Patient = {
      id: 'p1',
      userId: 'u1',
      firstName: 'Maria',
      lastNamePaternal: 'Lopez',
      lastNameMaternal: null,
      birthDate: '1990-05-20T00:00:00.000Z',
      birthPlace: null,
      sex: null,
      occupation: null,
      address: null,
      phone: '+59177001122',
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      consultationReason: null,
      lastDentistVisit: null,
      lastVisitTreatment: null,
      familyHistory: null,
      dni: '87654321',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    fixture.componentRef.setInput('existingPatient', patient);
    await settle(fixture);

    expect(el<HTMLInputElement>(fixture, FIRST_NAME).value).toBe('Maria');
    expect(el<HTMLInputElement>(fixture, LAST_NAME_PATERNAL).value).toBe('Lopez');
    expect(el<HTMLInputElement>(fixture, BIRTH_DATE).value).toBe('1990-05-20');
    expect(el<HTMLInputElement>(fixture, DNI).value).toBe('87654321');
  });

  // Paciente ya guardado con contacto de emergencia válido: reenviar el
  // step sin re-tocar el teléfono de emergencia no debe bloquear el submit.
  it('no exige re-tocar el teléfono de emergencia si el paciente ya lo tenía cargado', async () => {
    const fixture = setup();
    const patient: Patient = {
      id: 'p1',
      userId: 'u1',
      firstName: 'Maria',
      lastNamePaternal: 'Lopez',
      lastNameMaternal: null,
      birthDate: '1990-05-20T00:00:00.000Z',
      birthPlace: 'La Paz',
      sex: 'femenino',
      occupation: 'Doctora',
      address: 'Calle Falsa 123',
      phone: null,
      emergencyContactName: 'Pedro Lopez',
      emergencyContactPhone: '+59177001122',
      emergencyContactRelationship: 'Padre',
      consultationReason: null,
      lastDentistVisit: null,
      lastVisitTreatment: null,
      familyHistory: null,
      dni: '87654321',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    fixture.componentRef.setInput('existingPatient', patient);
    await settle(fixture);

    const emitted: unknown[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(1);
  });
});
