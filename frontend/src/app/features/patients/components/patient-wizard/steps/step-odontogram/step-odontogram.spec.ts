import { TestBed } from '@angular/core/testing';
import { StepOdontogramComponent } from './step-odontogram';
import type { DiagnosisCategory } from '../../../../../diagnoses/models/diagnosis.model';
import type { CreateDentalExamRequest } from '../../../../models/dental-exam.request';
import type { DentalExam, DentalExamVersionSummary } from '../../../../models/dental-exam.model';

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
    `.odontogram-chart__cell[aria-label="Diente ${toothNumber}"]`,
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

const VERSIONS: DentalExamVersionSummary[] = [
  {
    id: 'exam-1',
    version: 1,
    kind: 'diagnosis',
    recordedBy: 'doctor-1',
    recordedByName: 'Dr. Ariel',
    recordedAt: '2026-09-01T12:00:00.000Z',
    changeReason: null,
    findingsCount: 1,
  },
];

const CURRENT_EXAM: DentalExam = {
  id: 'exam-1',
  patientId: 'patient-1',
  version: 1,
  kind: 'diagnosis',
  recordedBy: 'doctor-1',
  recordedByName: 'Dr. Ariel',
  recordedAt: '2026-09-01T12:00:00.000Z',
  changeReason: null,
  notes: null,
  findings: [
    {
      id: 'finding-1',
      diagnosisId: 'diag-caries-2',
      diagnosisCode: 'caries_segundo_grado',
      diagnosisName: 'Caries de segundo grado',
      diagnosisScope: 'single_tooth',
      diagnosisColor: '#dc2626',
      categoryName: 'Caries dentales',
      toothNumber: 16,
      toothType: 'permanent',
      applicationGroupId: null,
      modifierValue: 'clase_ii',
      description: null,
      xrayRequested: false,
      notes: null,
    },
  ],
};

/** Monta el paso sobre un paciente con examen: "Corregir diagnóstico" o, con mode=new, "Nuevo diagnóstico". */
async function setupWithExistingExam(mode: 'new' | 'correct' = 'correct') {
  const fixture = setup();
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('catalog', CATALOG);
  fixture.componentRef.setInput('versions', VERSIONS);
  fixture.componentRef.setInput('currentExam', CURRENT_EXAM);
  await settle(fixture);
  return fixture;
}

function addGeneralFinding(fixture: ReturnType<typeof setup>): void {
  openAddPanel(fixture);
  fixture.detectChanges();
  select(el(fixture, '#diagnosisCode'), 'lesion_lengua');
  fixture.detectChanges();
  saveButton(fixture).click();
  fixture.detectChanges();
}

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

  it('exige motivo del cambio cuando se modifica un examen con versiones previas', async () => {
    const fixture = await setupWithExistingExam();
    addGeneralFinding(fixture);
    await settle(fixture);

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));

    submitButton(fixture).click();
    await settle(fixture);

    expect(emitted).toHaveLength(0);
    expect(el(fixture, '#changeReason.step-form__input--invalid')).toBeTruthy();
  });

  it('con motivo completo, envía el examen modificado', async () => {
    const fixture = await setupWithExistingExam();
    addGeneralFinding(fixture);
    await settle(fixture);

    const reason = el<HTMLTextAreaElement>(fixture, '#changeReason');
    reason.value = 'Se detectó una lesión nueva';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));
    submitButton(fixture).click();
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].findings).toHaveLength(2);
    expect(emitted[0].changeReason).toBe('Se detectó una lesión nueva');
  });

  it('sin cambios sobre el examen actual: no pide motivo, no deja guardar y ofrece cerrar', async () => {
    const fixture = await setupWithExistingExam();

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));
    let closed = 0;
    fixture.componentInstance.closeWithoutChanges.subscribe(() => closed++);

    expect(el(fixture, '#changeReason')).toBeFalsy();
    expect(submitButton(fixture).disabled).toBe(true);
    expect(el(fixture, '.odontogram-step__no-changes')?.textContent).toContain('No hay cambios');

    submitButton(fixture).click();
    await settle(fixture);
    expect(emitted).toHaveLength(0);

    el<HTMLButtonElement>(fixture, '.odontogram-step__close-btn').click();
    expect(closed).toBe(1);
  });

  it('agregar y quitar el mismo hallazgo vuelve a "sin cambios"', async () => {
    const fixture = await setupWithExistingExam();
    addGeneralFinding(fixture);
    await settle(fixture);
    expect(submitButton(fixture).disabled).toBe(false);

    const entries = fixture.nativeElement.querySelectorAll('.odontogram-step__entry');
    const added = entries[entries.length - 1] as HTMLElement;
    (added.querySelector('.odontogram-step__entry-remove') as HTMLButtonElement).click();
    await settle(fixture);

    expect(submitButton(fixture).disabled).toBe(true);
    expect(el(fixture, '#changeReason')).toBeFalsy();
  });

  it('reabrir un hallazgo y guardarlo sin tocar nada no cuenta como cambio', async () => {
    const fixture = await setupWithExistingExam();

    (fixture.nativeElement.querySelector('.odontogram-step__entry-edit') as HTMLButtonElement).click();
    await settle(fixture);
    saveButton(fixture).click();
    await settle(fixture);

    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('editar solo las notas de un hallazgo existente cuenta como cambio', async () => {
    const fixture = await setupWithExistingExam();

    (fixture.nativeElement.querySelector('.odontogram-step__entry-edit') as HTMLButtonElement).click();
    await settle(fixture);
    const notes = el<HTMLTextAreaElement>(fixture, '#findingNotes');
    notes.value = 'Controlar en 6 meses';
    notes.dispatchEvent(new Event('input'));
    await settle(fixture);
    saveButton(fixture).click();
    await settle(fixture);

    expect(submitButton(fixture).disabled).toBe(false);
    expect(el(fixture, '#changeReason')).toBeTruthy();
  });

  it('primera carga (sin versiones previas): se puede guardar un examen sin hallazgos', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));
    submitButton(fixture).click();
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].findings).toHaveLength(0);
  });

  describe('nuevo diagnóstico (CLI-109)', () => {
    it('arranca en blanco aunque el paciente tenga un examen vigente', async () => {
      const fixture = await setupWithExistingExam('new');

      expect(fixture.nativeElement.querySelectorAll('.odontogram-step__entry')).toHaveLength(0);
      expect(el(fixture, '.odontogram-step__previous')).toBeTruthy();
    });

    it('muestra el diagnóstico anterior en solo lectura al desplegarlo', async () => {
      const fixture = await setupWithExistingExam('new');

      el<HTMLButtonElement>(fixture, '.odontogram-step__previous .odontogram-step__history-toggle').click();
      await settle(fixture);

      const charts = fixture.nativeElement.querySelectorAll('app-odontogram-chart');
      expect(charts).toHaveLength(2);
      const previousCell = el<HTMLElement>(fixture, '.odontogram-step__previous .odontogram-chart__cell[aria-label="Diente 16"]');
      expect(previousCell.getAttribute('role')).toBeNull();
      expect(el(fixture, '.odontogram-step__previous').textContent).toContain('Caries de segundo grado');
    });

    it('"Copiar hallazgos del anterior" los suma al diagnóstico nuevo', async () => {
      const fixture = await setupWithExistingExam('new');

      el<HTMLButtonElement>(fixture, '.odontogram-step__copy-btn').click();
      await settle(fixture);

      const entries = fixture.nativeElement.querySelectorAll('.odontogram-step__chart > .odontogram-step__entries .odontogram-step__entry');
      expect(entries).toHaveLength(1);
      expect(entries[0].textContent).toContain('Diente #16');
    });

    it('si ya hay hallazgos cargados, pide confirmación antes de sumar los anteriores', async () => {
      const fixture = await setupWithExistingExam('new');
      addGeneralFinding(fixture);
      await settle(fixture);

      el<HTMLButtonElement>(fixture, '.odontogram-step__copy-btn').click();
      await settle(fixture);
      const ownEntries = () =>
        fixture.nativeElement.querySelectorAll('.odontogram-step__chart > .odontogram-step__entries .odontogram-step__entry');
      expect(el(fixture, '.odontogram-step__copy-confirm')).toBeTruthy();
      expect(ownEntries()).toHaveLength(1);

      el<HTMLButtonElement>(fixture, '.odontogram-step__copy-confirm .step-form__btn--primary').click();
      await settle(fixture);
      expect(el(fixture, '.odontogram-step__copy-confirm')).toBeFalsy();
      expect(ownEntries()).toHaveLength(2);
    });

    it('se guarda sin motivo y como kind=diagnosis, incluso sin hallazgos (boca sana)', async () => {
      const fixture = await setupWithExistingExam('new');

      expect(el(fixture, '#changeReason')).toBeFalsy();
      expect(submitButton(fixture).disabled).toBe(false);

      const emitted: CreateDentalExamRequest[] = [];
      fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));
      submitButton(fixture).click();
      await settle(fixture);

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ kind: 'diagnosis', findings: [], changeReason: undefined });
    });
  });

  it('corregir el vigente no manda kind (lo decide el backend)', async () => {
    const fixture = await setupWithExistingExam();
    addGeneralFinding(fixture);
    await settle(fixture);
    const reason = el<HTMLTextAreaElement>(fixture, '#changeReason');
    reason.value = 'Lesión nueva';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);

    const emitted: CreateDentalExamRequest[] = [];
    fixture.componentInstance.submitStep.subscribe((value) => emitted.push(value));
    submitButton(fixture).click();
    await settle(fixture);

    expect(emitted[0].kind).toBeUndefined();
  });
});
