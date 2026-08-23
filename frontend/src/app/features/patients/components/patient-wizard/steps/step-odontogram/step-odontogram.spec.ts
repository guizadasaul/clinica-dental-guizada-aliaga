import { TestBed } from '@angular/core/testing';
import { StepOdontogramComponent } from './step-odontogram';
import type { DiagnosisCategory } from '../../../../../diagnoses/models/diagnosis.model';
import type { CreateDentalExamRequest } from '../../../../models/dental-exam.request';

function setup() {
  TestBed.configureTestingModule({ imports: [StepOdontogramComponent] });
  return TestBed.createComponent(StepOdontogramComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function select(sel: HTMLSelectElement, value: string): void {
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
}

async function settle(fixture: ReturnType<typeof setup>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
}

/** Simula un clic en el diente #toothNumber del odontograma (aria-label="Diente N"). */
function clickTooth(fixture: ReturnType<typeof setup>, toothNumber: number): void {
  const cell = (fixture.nativeElement as HTMLElement).querySelector(
    `.odontogram-step__cell[aria-label="Diente ${toothNumber}"]`,
  );
  (cell as HTMLElement).dispatchEvent(new Event('click'));
}

const CATALOG: DiagnosisCategory[] = [
  {
    id: 'cat-caries',
    code: 'caries',
    name: 'Caries dentales',
    displayOrder: 0,
    diagnoses: [
      {
        id: 'diag-caries-2',
        categoryId: 'cat-caries',
        code: 'caries_segundo_grado',
        name: 'Caries de segundo grado',
        scope: 'single_tooth',
        modifier: 'black_class',
        color: '#dc2626',
        displayOrder: 0,
      },
    ],
  },
  {
    id: 'cat-periodontal',
    code: 'periodontal',
    name: 'Alteraciones periodontales',
    displayOrder: 1,
    diagnoses: [
      {
        id: 'diag-gingivitis',
        categoryId: 'cat-periodontal',
        code: 'gingivitis',
        name: 'Gingivitis',
        scope: 'multiple_teeth',
        modifier: 'none',
        color: '#0d9488',
        displayOrder: 0,
      },
    ],
  },
  {
    id: 'cat-soft-tissue',
    code: 'soft_tissue',
    name: 'Alteraciones de tejidos blandos',
    displayOrder: 2,
    diagnoses: [
      {
        id: 'diag-lesion-lengua',
        categoryId: 'cat-soft-tissue',
        code: 'lesion_lengua',
        name: 'Lesión de lengua',
        scope: 'general',
        modifier: 'none',
        color: '#db2777',
        displayOrder: 0,
      },
    ],
  },
];

function openAddPanel(fixture: ReturnType<typeof setup>): void {
  el<HTMLButtonElement>(fixture, '.odontogram-step__toolbar .step-form__btn').click();
}

function saveButton(fixture: ReturnType<typeof setup>): HTMLButtonElement {
  return el(fixture, '.odontogram-step__panel-actions .step-form__btn--primary');
}

function submitButton(fixture: ReturnType<typeof setup>): HTMLButtonElement {
  return el(fixture, '.odontogram-step__footer .step-form__btn--primary');
}

describe('StepOdontogramComponent', () => {
  it('single_tooth: clic en dos dientes distintos reemplaza la selección, no la acumula', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    openAddPanel(fixture);
    await settle(fixture);
    select(el(fixture, '#diagnosisCode'), 'caries_segundo_grado');
    await settle(fixture);

    clickTooth(fixture, 16);
    await settle(fixture);
    clickTooth(fixture, 17);
    await settle(fixture);

    const chips = fixture.nativeElement.querySelectorAll('.odontogram-step__panel-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('17');
  });

  it('single_tooth: exige el modificador (clase de Black) antes de guardar', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    openAddPanel(fixture);
    await settle(fixture);
    select(el(fixture, '#diagnosisCode'), 'caries_segundo_grado');
    await settle(fixture);
    clickTooth(fixture, 16);
    await settle(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    expect(el(fixture, '.step-form__error')?.textContent).toContain('clase de Black');
    expect(fixture.nativeElement.querySelectorAll('.odontogram-step__entry')).toHaveLength(0);
  });

  it('single_tooth: con modificador elegido, guarda el hallazgo', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    openAddPanel(fixture);
    await settle(fixture);
    select(el(fixture, '#diagnosisCode'), 'caries_segundo_grado');
    await settle(fixture);
    clickTooth(fixture, 16);
    await settle(fixture);
    select(el(fixture, '#modifierValue'), 'clase_ii');
    await settle(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.odontogram-step__panel')).toBeFalsy();
    const entries = fixture.nativeElement.querySelectorAll('.odontogram-step__entry');
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain('Diente #16');
    expect(entries[0].textContent).toContain('Caries de segundo grado');
    expect(entries[0].textContent).toContain('Clase II');
  });

  it('multiple_teeth: el clic togglea la pertenencia de cada diente', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    openAddPanel(fixture);
    await settle(fixture);
    select(el(fixture, '#diagnosisCode'), 'gingivitis');
    await settle(fixture);

    clickTooth(fixture, 16);
    clickTooth(fixture, 17);
    await settle(fixture);
    let chips = fixture.nativeElement.querySelectorAll('.odontogram-step__panel-chip');
    expect(chips).toHaveLength(2);

    clickTooth(fixture, 16);
    await settle(fixture);
    chips = fixture.nativeElement.querySelectorAll('.odontogram-step__panel-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('17');
  });

  it('general: no requiere ni permite seleccionar dientes', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    openAddPanel(fixture);
    await settle(fixture);
    select(el(fixture, '#diagnosisCode'), 'lesion_lengua');
    await settle(fixture);

    expect(el(fixture, '.odontogram-step__panel-chips')).toBeFalsy();

    saveButton(fixture).click();
    await settle(fixture);

    const entries = fixture.nativeElement.querySelectorAll('.odontogram-step__entry');
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain('Lesión de lengua');
    expect(entries[0].textContent).not.toContain('Diente #');
  });

  it('el envío final no manda hallazgos sanos — solo lo que el doctor agregó', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    openAddPanel(fixture);
    await settle(fixture);
    select(el(fixture, '#diagnosisCode'), 'lesion_lengua');
    await settle(fixture);
    saveButton(fixture).click();
    await settle(fixture);

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    submitButton(fixture).click();
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].findings).toHaveLength(1);
    expect(emitted[0].findings[0]).toMatchObject({
      diagnosisCode: 'lesion_lengua',
      toothNumbers: undefined,
    });
  });

  it('exige motivo del cambio cuando ya existen versiones previas', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    fixture.componentRef.setInput('versions', [
      {
        id: 'exam-1',
        version: 1,
        recordedByName: 'Dr. Ariel',
        recordedAt: new Date().toISOString(),
        changeReason: null,
        findingsCount: 0,
      },
    ]);
    await settle(fixture);

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    submitButton(fixture).click();
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, '#changeReason.step-form__input--invalid')).toBeTruthy();
  });
});
