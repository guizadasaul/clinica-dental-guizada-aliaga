import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  RegisterTreatmentOdontogramComponent,
  type ProcedureRegisteredEvent,
} from './register-treatment-odontogram';
import type { Treatment, ToothProcedure } from '../../models/treatment.model';
import type { DentalExam } from '../../../patients/models/dental-exam.model';
import type { DiagnosisCategory } from '../../../diagnoses/models/diagnosis.model';

function setup() {
  TestBed.configureTestingModule({
    imports: [RegisterTreatmentOdontogramComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(RegisterTreatmentOdontogramComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

function el<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

/** Elige un tratamiento en el CatalogPicker del panel (CLI-116). */
function pickTreatment(fixture: ReturnType<typeof setup>['fixture'], id: string): void {
  const option = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `.catalog-picker__option[data-id="${id}"]`,
  );
  if (!option) { throw new Error(`No hay opción ${id} en el picker`); }
  option.click();
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Simula un clic en el diente #toothNumber del odontograma (aria-label="Diente N"). */
function clickTooth(fixture: ReturnType<typeof setup>['fixture'], toothNumber: number): void {
  const cell = (fixture.nativeElement as HTMLElement).querySelector(
    `.odontogram-chart__cell[aria-label="Diente ${toothNumber}"]`,
  );
  (cell as HTMLElement).dispatchEvent(new Event('click'));
}

function saveButton(fixture: ReturnType<typeof setup>['fixture']): HTMLButtonElement {
  return el(fixture, '.rto__panel-actions .rto__btn--primary');
}

function addTreatmentButton(fixture: ReturnType<typeof setup>['fixture']): HTMLButtonElement {
  return el(fixture, '.rto__toolbar .rto__btn--secondary');
}

function fakeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    code: 'corona_metalica',
    name: 'Corona metálica',
    description: null,
    basePrice: 350,
    estimatedMinutes: 60,
    applicationType: 'single_tooth',
    currency: 'BOB',
    basePriceBob: null,
    categoryId: 'cat-1',
    categoryCode: 'protesis_fija',
    categoryName: 'Prótesis fija',
    categoryColor: '#0369a1',
    displayOrder: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeProcedure(overrides: Partial<ToothProcedure> = {}): ToothProcedure {
  return {
    id: 'proc-1',
    patientId: 'patient-1',
    toothNumber: 16,
    applicationGroupId: null,
    treatmentId: 'treatment-endo',
    applicationType: 'single_tooth',
    categoryCode: 'endodoncia',
    categoryName: 'Endodoncia',
    categoryColor: '#a21caf',
    priceCharged: 350,
    quantity: 1,
    procedureDate: '2026-09-20',
    surfaces: [],
    notes: null,
    performedBy: 'doctor-1',
    createdAt: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

const EXAM_WITH_CARIES_16: DentalExam = {
  id: 'exam-1',
  patientId: 'patient-1',
  version: 1,
  kind: 'diagnosis',
  recordedBy: 'user-1',
  recordedByName: 'Dr. Ariel',
  recordedAt: '2026-09-01T12:00:00.000Z',
  changeReason: null,
  notes: null,
  findings: [
    {
      id: 'finding-1',
      diagnosisId: 'diag-1',
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

function toothFill(fixture: ReturnType<typeof setup>['fixture'], toothNumber: number): string | null {
  return el<HTMLElement>(fixture, `.odontogram-chart__cell[aria-label="Diente ${toothNumber}"]`)
    .querySelector('.odontogram-chart__cell-shape')
    ?.getAttribute('fill') ?? null;
}

function toothPaint(fixture: ReturnType<typeof setup>['fixture'], toothNumber: number): Element {
  return el<HTMLElement>(fixture, `.odontogram-chart__cell[aria-label="Diente ${toothNumber}"]`)
    .querySelector('.odontogram-chart__cell-paint') as Element;
}

describe('RegisterTreatmentOdontogramComponent', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('el odontograma está visible desde el principio, sin elegir tratamiento antes', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    await settle(fixture);

    expect(el(fixture, '.odontogram-chart__canvas')).toBeTruthy();
    expect(el(fixture, '.rto__panel')).toBeFalsy();
  });

  it('clic en un diente abre el panel para esa pieza, sin tratamiento elegido todavía', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    await settle(fixture);

    clickTooth(fixture, 16);
    await settle(fixture);

    expect(el(fixture, '.rto__panel')).toBeTruthy();
    expect(el(fixture, '.rto__panel-tooth-badge')?.textContent).toContain('Diente #16');
    expect(el(fixture, '.catalog-picker__search-input')).toBeTruthy();
    expect(el(fixture, '.catalog-picker__option--selected')).toBeNull();
  });

  it('single_tooth: clic en dos dientes distintos reemplaza la selección, no la acumula', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment({ applicationType: 'single_tooth' })]);
    await settle(fixture);

    clickTooth(fixture, 16);
    await settle(fixture);
    pickTreatment(fixture, 'treatment-1');
    await settle(fixture);

    clickTooth(fixture, 17);
    await settle(fixture);

    expect(el(fixture, '.rto__panel-tooth-badge')?.textContent).toContain('Diente #17');
    expect(fixture.nativeElement.querySelectorAll('.rto__panel-field label').length).toBeGreaterThan(0);
  });

  it('multiple_teeth: el clic togglea la pertenencia de cada diente y acepta 1 solo diente', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-multi', applicationType: 'multiple_teeth' }),
    ]);
    await settle(fixture);

    clickTooth(fixture, 16);
    await settle(fixture);
    pickTreatment(fixture, 't-multi');
    await settle(fixture);

    clickTooth(fixture, 17);
    await settle(fixture);

    expect(el(fixture, '.rto__panel-tooth-badge')?.textContent).toContain('2 dientes: #16, #17');

    clickTooth(fixture, 16);
    await settle(fixture);
    expect(el(fixture, '.rto__panel-tooth-badge')?.textContent).toContain('Diente #17');
  });

  it('upper_arch: preselecciona la arcada superior y el clic manual no cambia nada', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-upper', applicationType: 'upper_arch', basePrice: 400 }),
    ]);
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.rto__toolbar .rto__btn--secondary').click();
    await settle(fixture);
    pickTreatment(fixture, 't-upper');
    await settle(fixture);

    const cell = el<HTMLElement>(fixture, '.odontogram-chart__cell[aria-label="Diente 16"]');
    expect(cell.classList.contains('odontogram-chart__cell--selected')).toBe(true);

    cell.dispatchEvent(new Event('click'));
    await settle(fixture);
    // el panel sigue sin pedir dientes — la arcada se deriva sola, el clic no hizo nada.
    expect(el(fixture, '.rto__panel-hint')?.textContent).toContain('arcada superior');
  });

  it('general: "Agregar tratamiento" abre el panel sin diente y no muestra superficies', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-general', applicationType: 'general' }),
    ]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);
    expect(el(fixture, '.rto__panel-tooth-badge')?.textContent).toContain('Nuevo tratamiento');

    pickTreatment(fixture, 't-general');
    await settle(fixture);

    expect(fixture.nativeElement.querySelectorAll('.rto__surfaces').length).toBe(0);
  });

  it('unit: pide cantidad y calcula el total, no un precio editable', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-unit', applicationType: 'unit', basePrice: 20 }),
    ]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);
    pickTreatment(fixture, 't-unit');
    await settle(fixture);

    expect(el(fixture, '#priceCharged')).toBeFalsy();
    const quantityInput = el<HTMLInputElement>(fixture, '#quantity');
    expect(quantityInput.value).toBe('1');

    quantityInput.value = '3';
    quantityInput.dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(el(fixture, '.rto__fx-hint')?.textContent).toContain('60.00');
  });

  it('guarda un procedimiento y emite procedureRegistered con las superficies del diente', async () => {
    const { fixture, httpMock } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment({ applicationType: 'single_tooth' })]);
    await settle(fixture);

    const emitted: ProcedureRegisteredEvent[] = [];
    fixture.componentInstance.procedureRegistered.subscribe((e) => emitted.push(e));

    clickTooth(fixture, 16);
    await settle(fixture);
    pickTreatment(fixture, 'treatment-1');
    await settle(fixture);

    const occlusal = fixture.nativeElement.querySelector('.rto__check input[data-surface="occlusal"]') as HTMLInputElement;
    occlusal.checked = true;
    occlusal.dispatchEvent(new Event('change'));
    await settle(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    const req = httpMock.expectOne('http://localhost:2999/patients/patient-1/tooth-procedures');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      treatmentId: 'treatment-1',
      priceCharged: 350,
      teeth: [{ number: 16, surfaces: ['occlusal'] }],
    });
    req.flush([{ id: 'proc-1', toothNumber: 16, treatmentId: 'treatment-1', priceCharged: 350 }]);
    await settle(fixture);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].message).toContain('diente #16');
    expect(el(fixture, '.rto__panel')).toBeFalsy();
  });

  it('el selector agrupa los tratamientos en chips de categoría y filtra al elegir una', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-1', name: 'Corona metálica', categoryCode: 'protesis_fija', categoryName: 'Prótesis fija' }),
      fakeTreatment({ id: 't-2', name: 'Tratamiento de conducto', categoryCode: 'endodoncia', categoryName: 'Endodoncia' }),
    ]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);

    const chips = [...fixture.nativeElement.querySelectorAll('.catalog-picker__chip')].map((c) => (c as HTMLElement).textContent?.trim());
    expect(chips).toEqual(['Todos', 'Prótesis fija', 'Endodoncia']);

    (fixture.nativeElement.querySelectorAll('.catalog-picker__chip')[2] as HTMLButtonElement).click();
    await settle(fixture);
    const options = [...fixture.nativeElement.querySelectorAll('.catalog-picker__option')] as HTMLElement[];
    expect(options.map((o) => o.dataset['id'])).toEqual(['t-2']);
  });

  it('la opción del tratamiento no muestra el precio', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment({ basePrice: 350 })]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);

    const option = el<HTMLElement>(fixture, '.catalog-picker__option[data-id="treatment-1"]');
    expect(option.textContent?.trim()).toBe('Corona metálica');
  });

  it('pinta el odontograma con el diagnóstico vigente del paciente, no con odontogram_entries', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    fixture.componentRef.setInput('currentExam', {
      id: 'exam-1',
      patientId: 'patient-1',
      version: 2,
      kind: 'diagnosis',
      recordedBy: 'user-1',
      recordedByName: 'Dr. Ariel',
      recordedAt: new Date().toISOString(),
      changeReason: null,
      notes: null,
      findings: [
        {
          id: 'finding-1',
          diagnosisId: 'diag-1',
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
    } satisfies DentalExam);
    await settle(fixture);

    const cell = el<HTMLElement>(fixture, '.odontogram-chart__cell[aria-label="Diente 16"]');
    const path = cell.querySelector('.odontogram-chart__cell-shape') as SVGPathElement;
    expect(path.getAttribute('fill')).toBe('#dc2626');
  });

  it('la leyenda sale del catálogo real de diagnósticos (categorías con al menos un diagnóstico)', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    fixture.componentRef.setInput('catalog', [
      {
        id: 'cat-1',
        code: 'caries',
        name: 'Caries dentales',
        displayOrder: 0,
        diagnoses: [
          {
            id: 'diag-1',
            categoryId: 'cat-1',
            code: 'caries_segundo_grado',
            name: 'Caries de segundo grado',
            scope: 'single_tooth',
            modifier: 'black_class',
            color: '#dc2626',
            displayOrder: 0,
          },
        ],
      },
      { id: 'cat-2', code: 'vacia', name: 'Categoría sin diagnósticos', displayOrder: 1, diagnoses: [] },
    ] satisfies DiagnosisCategory[]);
    await settle(fixture);

    const legendItems = fixture.nativeElement.querySelectorAll('.odontogram-chart__legend-item');
    expect(legendItems).toHaveLength(1);
    expect(legendItems[0].textContent).toContain('Caries dentales');
  });

  describe('color de los tratamientos registrados (CLI-107)', () => {
    it('un tratamiento pinta su diente con el color de la categoría y pisa al diagnóstico', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('treatments', [fakeTreatment()]);
      fixture.componentRef.setInput('currentExam', EXAM_WITH_CARIES_16);
      fixture.componentRef.setInput('procedures', [fakeProcedure()]);
      await settle(fixture);

      expect(toothFill(fixture, 16)).toBe('#a21caf');
      expect(toothPaint(fixture, 16).classList).toContain('odontogram-chart__cell-paint--treated');
      expect(toothPaint(fixture, 36).classList).not.toContain('odontogram-chart__cell-paint--treated');
    });

    it('si un diente tiene varios tratamientos, gana el más reciente', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('treatments', [fakeTreatment()]);
      fixture.componentRef.setInput('procedures', [
        fakeProcedure({ id: 'p-new', procedureDate: '2026-09-21', categoryColor: '#0369a1' }),
        fakeProcedure({ id: 'p-old', procedureDate: '2026-09-10' }),
      ]);
      await settle(fixture);

      expect(toothFill(fixture, 16)).toBe('#0369a1');
    });

    it('un tratamiento de arcada superior pinta toda la arcada', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('treatments', [fakeTreatment()]);
      fixture.componentRef.setInput('procedures', [
        fakeProcedure({ toothNumber: null, applicationType: 'upper_arch', categoryColor: '#0f766e' }),
      ]);
      await settle(fixture);

      for (const n of [18, 11, 21, 28]) {
        expect(toothFill(fixture, n)).toBe('#0f766e');
      }
      expect(toothFill(fixture, 36)).toBe('transparent');
    });

    it('un tratamiento general no pinta ningún diente ni aparece en la leyenda', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('treatments', [fakeTreatment()]);
      fixture.componentRef.setInput('procedures', [
        fakeProcedure({ toothNumber: null, applicationType: 'general', categoryName: 'Básicos' }),
      ]);
      await settle(fixture);

      expect(fixture.nativeElement.querySelectorAll('.odontogram-chart__cell-paint--treated')).toHaveLength(0);
      expect(fixture.nativeElement.querySelector('.odontogram-chart__legend')).toBeFalsy();
    });

    it('la leyenda agrupa diagnósticos y tratamientos, con solo las categorías presentes', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('treatments', [fakeTreatment()]);
      fixture.componentRef.setInput('catalog', [
        {
          id: 'cat-1',
          code: 'caries',
          name: 'Caries dentales',
          displayOrder: 0,
          diagnoses: [
            {
              id: 'diag-1',
              categoryId: 'cat-1',
              code: 'caries_segundo_grado',
              name: 'Caries de segundo grado',
              scope: 'single_tooth',
              modifier: 'black_class',
              color: '#dc2626',
              displayOrder: 0,
            },
          ],
        },
      ] satisfies DiagnosisCategory[]);
      fixture.componentRef.setInput('procedures', [
        fakeProcedure({ id: 'p-1', toothNumber: 16 }),
        fakeProcedure({ id: 'p-2', toothNumber: 26 }),
      ]);
      await settle(fixture);

      const titles = [...fixture.nativeElement.querySelectorAll('.odontogram-chart__legend-title')]
        .map((t) => (t as HTMLElement).textContent?.trim());
      expect(titles).toEqual(['Diagnósticos', 'Tratamientos']);
      const items = [...fixture.nativeElement.querySelectorAll('.odontogram-chart__legend-item')]
        .map((t) => (t as HTMLElement).textContent?.trim());
      expect(items).toEqual(['Caries dentales', 'Endodoncia']);
    });

    it('tras registrar un tratamiento, el diente queda con su color cuando el padre lo agrega', async () => {
      const { fixture, httpMock } = setup();
      fixture.componentRef.setInput('treatments', [fakeTreatment({ applicationType: 'single_tooth' })]);
      fixture.componentRef.setInput('currentExam', EXAM_WITH_CARIES_16);
      await settle(fixture);

      const emitted: ProcedureRegisteredEvent[] = [];
      fixture.componentInstance.procedureRegistered.subscribe((e) => emitted.push(e));

      clickTooth(fixture, 16);
      await settle(fixture);
      pickTreatment(fixture, 'treatment-1');
      await settle(fixture);
      saveButton(fixture).click();
      await settle(fixture);

      const created = fakeProcedure({ id: 'proc-new', treatmentId: 'treatment-1', categoryColor: '#0369a1' });
      httpMock.expectOne('http://localhost:2999/patients/patient-1/tooth-procedures').flush([created]);
      await settle(fixture);

      // El padre (RegisterTreatmentComponent) agrega lo emitido a su lista y la reinyecta.
      fixture.componentRef.setInput('procedures', emitted[0].procedures);
      await settle(fixture);

      expect(toothFill(fixture, 16)).toBe('#0369a1');
      expect(toothPaint(fixture, 16).classList).toContain('odontogram-chart__cell-paint--treated');
    });
  });

  it('no repite el título de la pantalla dentro del odontograma (CLI-112)', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('h3')).toBeNull();
  });
  it('con frecuentes del doctor, el selector abre en "Frecuentes" con esos tratamientos (CLI-118)', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-1', name: 'Corona metálica' }),
      fakeTreatment({ id: 't-2', name: 'Tratamiento de conducto', categoryCode: 'endodoncia', categoryName: 'Endodoncia' }),
    ]);
    fixture.componentRef.setInput('frequentTreatmentIds', ['t-2']);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);

    const active = fixture.nativeElement.querySelector('.catalog-picker__chip--active') as HTMLElement;
    expect(active.textContent?.trim()).toBe('Frecuentes');
    const options = [...fixture.nativeElement.querySelectorAll('.catalog-picker__option')] as HTMLElement[];
    expect(options.map((o) => o.dataset['id'])).toEqual(['t-2']);
  });

  it('sin frecuentes no aparece el chip "Frecuentes"', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);

    const chips = [...fixture.nativeElement.querySelectorAll('.catalog-picker__chip')].map((c) => (c as HTMLElement).textContent?.trim());
    expect(chips).not.toContain('Frecuentes');
  });
});
