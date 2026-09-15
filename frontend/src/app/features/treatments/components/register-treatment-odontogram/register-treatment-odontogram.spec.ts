import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  RegisterTreatmentOdontogramComponent,
  type ProcedureRegisteredEvent,
} from './register-treatment-odontogram';
import type { Treatment } from '../../models/treatment.model';
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

function select(sel: HTMLSelectElement, value: string): void {
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
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
    displayOrder: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
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
    expect(el<HTMLSelectElement>(fixture, '#rto-treatment').value).toBe('');
  });

  it('single_tooth: clic en dos dientes distintos reemplaza la selección, no la acumula', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment({ applicationType: 'single_tooth' })]);
    await settle(fixture);

    clickTooth(fixture, 16);
    await settle(fixture);
    select(el(fixture, '#rto-treatment'), 'treatment-1');
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
    select(el(fixture, '#rto-treatment'), 't-multi');
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
    select(el(fixture, '#rto-treatment'), 't-upper');
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

    select(el(fixture, '#rto-treatment'), 't-general');
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
    select(el(fixture, '#rto-treatment'), 't-unit');
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
    select(el(fixture, '#rto-treatment'), 'treatment-1');
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

  it('agrupa el <select> por categoría', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [
      fakeTreatment({ id: 't-1', categoryCode: 'protesis_fija', categoryName: 'Prótesis fija' }),
      fakeTreatment({ id: 't-2', categoryCode: 'endodoncia', categoryName: 'Endodoncia' }),
    ]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);

    const groups = fixture.nativeElement.querySelectorAll('optgroup');
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('label')).toBe('Prótesis fija');
    expect(groups[1].getAttribute('label')).toBe('Endodoncia');
  });

  it('el <option> del tratamiento no muestra el precio', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment({ basePrice: 350 })]);
    await settle(fixture);

    addTreatmentButton(fixture).click();
    await settle(fixture);

    const option = fixture.nativeElement.querySelector('#rto-treatment option[value="treatment-1"]');
    expect(option.textContent.trim()).toBe('Corona metálica');
  });

  it('pinta el odontograma con el diagnóstico vigente del paciente, no con odontogram_entries', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('treatments', [fakeTreatment()]);
    fixture.componentRef.setInput('currentExam', {
      id: 'exam-1',
      patientId: 'patient-1',
      version: 2,
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
});
