import { TestBed } from '@angular/core/testing';
import { StepMedicalHistoryComponent } from './step-medical-history';
import type { CreateMedicalHistoryRequest } from '../../../../models/patient.request';
import type { MedicalCondition } from '../../../../../medical-conditions/models/medical-condition.model';

const CATALOG: MedicalCondition[] = [
  { id: 'cond-1', code: 'diabetes', name: 'Diabetes', displayOrder: 0 },
  { id: 'cond-2', code: 'asma', name: 'Asma', displayOrder: 1 },
];

function setup() {
  TestBed.configureTestingModule({
    imports: [StepMedicalHistoryComponent],
  });
  const fixture = TestBed.createComponent(StepMedicalHistoryComponent);
  fixture.componentRef.setInput('catalog', CATALOG);
  return fixture;
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function elAll<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector)) as T[];
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

function futureIsoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('StepMedicalHistoryComponent', () => {
  it('renders one checkbox per condition in the catalog', async () => {
    const fixture = setup();
    await settle(fixture);

    expect(elAll(fixture, '.mh-step__condition').length).toBe(CATALOG.length);
  });

  it('emits the checked condition codes on submit, with no detail fields touched', async () => {
    const fixture = setup();
    await settle(fixture);
    const emitted: CreateMedicalHistoryRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((v) => emitted.push(v));

    const [firstCheckbox] = elAll<HTMLInputElement>(fixture, '.mh-step__condition input[type="checkbox"]');
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event('change'));
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].conditions).toEqual([{ code: 'diabetes', diagnosedAt: undefined, notes: undefined }]);
  });

  it('unchecking a condition removes it and its detail fields from the submitted payload', async () => {
    const fixture = setup();
    await settle(fixture);
    const emitted: CreateMedicalHistoryRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((v) => emitted.push(v));

    const [firstCheckbox] = elAll<HTMLInputElement>(fixture, '.mh-step__condition input[type="checkbox"]');
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event('change'));
    await settle(fixture);
    firstCheckbox.checked = false;
    firstCheckbox.dispatchEvent(new Event('change'));
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(emitted[0].conditions).toEqual([]);
  });

  it('adds a medication row and includes it in the submitted payload', async () => {
    const fixture = setup();
    await settle(fixture);
    const emitted: CreateMedicalHistoryRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((v) => emitted.push(v));

    el<HTMLButtonElement>(fixture, '.mh-step__add-medication').click();
    await settle(fixture);

    const [drugName] = elAll<HTMLInputElement>(fixture, '.mh-step__medication-row input[placeholder="Fármaco"]');
    type(drugName, 'Metformina');
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(emitted[0].medications).toEqual([
      { drugName: 'Metformina', dose: undefined, frequency: undefined, startedAt: undefined },
    ]);
  });

  it('rejects a medication row where dose was filled but drugName was left empty, without emitting', async () => {
    const fixture = setup();
    await settle(fixture);
    const emitted: CreateMedicalHistoryRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((v) => emitted.push(v));

    el<HTMLButtonElement>(fixture, '.mh-step__add-medication').click();
    await settle(fixture);
    const [dose] = elAll<HTMLInputElement>(fixture, '.mh-step__medication-row input[placeholder="Dosis"]');
    type(dose, '850mg');
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(0);
  });

  it('silently drops a fully empty medication row instead of blocking submit', async () => {
    const fixture = setup();
    await settle(fixture);
    const emitted: CreateMedicalHistoryRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((v) => emitted.push(v));

    el<HTMLButtonElement>(fixture, '.mh-step__add-medication').click();
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].medications).toEqual([]);
  });

  it('rejects a future gestationLmpDate, without emitting', async () => {
    const fixture = setup();
    await settle(fixture);
    const emitted: CreateMedicalHistoryRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((v) => emitted.push(v));

    type(el<HTMLInputElement>(fixture, '#gestationLmpDate'), futureIsoDate(10));
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, '#gestationLmpDate-err')).toBeTruthy();
  });

  it('emits back on the "Anterior" button', async () => {
    const fixture = setup();
    await settle(fixture);
    let backEmitted = false;
    fixture.componentInstance.back.subscribe(() => (backEmitted = true));

    el<HTMLButtonElement>(fixture, '.step-form__actions button[type="button"]').click();

    expect(backEmitted).toBe(true);
  });
});
