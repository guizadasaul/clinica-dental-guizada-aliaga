import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StepOdontogramComponent } from './step-odontogram';
import { PatientsService } from '../../../../services/patients.service';
import type { DiagnosisCategory } from '../../../../../diagnoses/models/diagnosis.model';
import type { CreateDentalExamRequest } from '../../../../models/dental-exam.request';
import type { DentalExam, DentalExamVersionSummary } from '../../../../models/dental-exam.model';

/** Examen viejo (versión 1) que trae el historial al desplegarlo (CLI-114). */
let olderExam: DentalExam | null = null;

function setup() {
  TestBed.configureTestingModule({
    imports: [StepOdontogramComponent],
    providers: [{ provide: PatientsService, useValue: { getDentalExam: () => of(olderExam) } }],
  });
  return TestBed.createComponent(StepOdontogramComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

/** Elige un diagnóstico por código en el CatalogPicker del panel (CLI-117). */
function pickDiagnosis(fixture: ReturnType<typeof setup>, code: string): void {
  const option = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `.catalog-picker__option[data-id="${code}"]`,
  );
  if (!option) { throw new Error(`No hay opción ${code} en el picker`); }
  option.click();
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
  pickDiagnosis(fixture, 'lesion_lengua');
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
    pickDiagnosis(fixture, 'caries_segundo_grado');
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
    pickDiagnosis(fixture, 'caries_segundo_grado');
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
    pickDiagnosis(fixture, 'caries_segundo_grado');
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
    pickDiagnosis(fixture, 'gingivitis');
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
    pickDiagnosis(fixture, 'lesion_lengua');
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
    pickDiagnosis(fixture, 'lesion_lengua');
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

  describe('nuevo diagnóstico (CLI-109/114)', () => {
    const OLDER: DentalExam = {
      ...CURRENT_EXAM,
      id: 'exam-0',
      version: 1,
      recordedAt: '2021-03-01T12:00:00.000Z',
      findings: [{ ...CURRENT_EXAM.findings[0], id: 'finding-old', toothNumber: 36 }],
    };
    const TWO_VERSIONS: DentalExamVersionSummary[] = [
      { ...VERSIONS[0], version: 2 },
      { ...VERSIONS[0], id: 'exam-0', version: 1, recordedAt: OLDER.recordedAt },
    ];

    async function setupNew() {
      olderExam = OLDER;
      const fixture = await setupWithExistingExam('new');
      fixture.componentRef.setInput('patientId', 'patient-1');
      fixture.componentRef.setInput('versions', TWO_VERSIONS);
      await settle(fixture);
      return fixture;
    }

    function openHistory(fixture: ReturnType<typeof setup>): Promise<void> {
      el<HTMLButtonElement>(fixture, '.odontogram-step__history-toggle').click();
      return settle(fixture);
    }

    function historyToggles(fixture: ReturnType<typeof setup>): HTMLButtonElement[] {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.exam-history__toggle')];
    }

    const ownEntries = (fixture: ReturnType<typeof setup>) =>
      (fixture.nativeElement as HTMLElement).querySelectorAll('.odontogram-step__chart > .odontogram-step__entries .odontogram-step__entry');

    it('arranca en blanco aunque el paciente tenga un examen vigente', async () => {
      const fixture = await setupNew();

      expect(ownEntries(fixture)).toHaveLength(0);
      expect(el(fixture, '.odontogram-step__history-toggle')?.textContent).toContain('Diagnósticos anteriores');
    });

    it('lista todos los diagnósticos anteriores, con el vigente desplegado en solo lectura', async () => {
      const fixture = await setupNew();
      await openHistory(fixture);

      expect(historyToggles(fixture)).toHaveLength(2);
      const cell = el<HTMLElement>(fixture, 'app-dental-exam-history .odontogram-chart__cell[aria-label="Diente 16"]');
      expect(cell.getAttribute('role')).toBeNull();
    });

    it('copia los hallazgos de un diagnóstico anterior que no es el vigente', async () => {
      const fixture = await setupNew();
      await openHistory(fixture);
      historyToggles(fixture)[1].click();
      await settle(fixture);
      // El historial trae el examen con async/await: dejar correr esa continuación.
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();

      el<HTMLButtonElement>(fixture, '.exam-history__copy').click();
      await settle(fixture);

      expect(ownEntries(fixture)).toHaveLength(1);
      expect(ownEntries(fixture)[0].textContent).toContain('Diente #36');
    });

    it('si ya hay hallazgos cargados, pide confirmación antes de sumar los anteriores', async () => {
      const fixture = await setupNew();
      addGeneralFinding(fixture);
      await settle(fixture);
      await openHistory(fixture);

      el<HTMLButtonElement>(fixture, '.exam-history__copy').click();
      await settle(fixture);
      expect(el(fixture, '.odontogram-step__copy-confirm')).toBeTruthy();
      expect(ownEntries(fixture)).toHaveLength(1);

      el<HTMLButtonElement>(fixture, '.odontogram-step__copy-confirm .step-form__btn--primary').click();
      await settle(fixture);
      expect(el(fixture, '.odontogram-step__copy-confirm')).toBeFalsy();
      expect(ownEntries(fixture)).toHaveLength(2);
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

  it('no repite el título de la pantalla dentro del odontograma (CLI-112)', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('h3')).toBeNull();
  });

  it('corregir diagnóstico: el historial muestra odontogramas pero no ofrece copiar (CLI-114)', async () => {
    const fixture = await setupWithExistingExam();
    fixture.componentRef.setInput('patientId', 'patient-1');
    await settle(fixture);

    const toggle = el<HTMLButtonElement>(fixture, '.odontogram-step__history-toggle');
    expect(toggle.textContent).toContain('Historial del examen');
    toggle.click();
    await settle(fixture);
    (fixture.nativeElement.querySelector('.exam-history__toggle') as HTMLButtonElement).click();
    await settle(fixture);

    expect(el(fixture, 'app-dental-exam-history app-odontogram-chart')).toBeTruthy();
    expect(el(fixture, '.exam-history__copy')).toBeNull();
  });

  it('el selector de diagnóstico busca sin tildes y muestra el alcance (CLI-117)', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    await settle(fixture);
    openAddPanel(fixture);
    await settle(fixture);

    const input = el<HTMLInputElement>(fixture, '.catalog-picker__search-input');
    input.value = 'lesion';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    const options = [...fixture.nativeElement.querySelectorAll('.catalog-picker__option')] as HTMLElement[];
    expect(options.map((o) => o.dataset['id'])).toEqual(['lesion_lengua']);
    expect(options[0].textContent).toContain('General');
  });

  it('al editar un hallazgo el selector arranca con su diagnóstico elegido', async () => {
    const fixture = await setupWithExistingExam();

    (fixture.nativeElement.querySelector('.odontogram-step__entry-edit') as HTMLButtonElement).click();
    await settle(fixture);

    expect(el(fixture, '.catalog-picker__selected-label')?.textContent).toContain('Caries de segundo grado');
  });
  it('con frecuentes del doctor, el selector de diagnóstico abre en "Frecuentes" (CLI-118)', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', CATALOG);
    fixture.componentRef.setInput('frequentDiagnosisCodes', ['gingivitis', 'lesion_lengua']);
    await settle(fixture);
    openAddPanel(fixture);
    await settle(fixture);

    expect(el(fixture, '.catalog-picker__chip--active')?.textContent?.trim()).toBe('Frecuentes');
    const options = [...fixture.nativeElement.querySelectorAll('.catalog-picker__option')] as HTMLElement[];
    expect(options.map((o) => o.dataset['id'])).toEqual(['gingivitis', 'lesion_lengua']);
  });
});
