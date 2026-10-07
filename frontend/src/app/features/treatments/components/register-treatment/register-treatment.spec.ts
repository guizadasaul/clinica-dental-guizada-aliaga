import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { RegisterTreatmentComponent } from './register-treatment';
import { TreatmentsService } from '../../services/treatments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { QuotesService } from '../../../quotes/services/quotes.service';
import type { Quote, QuoteItem } from '../../../quotes/models/quote.model';
import type { PlanLine } from '../../../quotes/utils/treatment-plan';
import type { ProcedureRegisteredEvent } from '../register-treatment-odontogram/register-treatment-odontogram';
import type { ToothProcedure } from '../../models/treatment.model';

// El odontograma de tratamientos tiene su propio spec.
@Component({ selector: 'app-register-treatment-odontogram', standalone: true, template: '' })
class OdontogramStub {
  readonly patientId = input('');
  readonly treatments = input<unknown[]>([]);
  readonly catalog = input<unknown[]>([]);
  readonly currentExam = input<unknown>(null);
  readonly procedures = input<ToothProcedure[]>([]);
  readonly frequentTreatmentIds = input<string[]>([]);
  readonly planLines = input<PlanLine[]>([]);
  readonly procedureRegistered = output<ProcedureRegisteredEvent>();
  readonly openForPlanLine = vi.fn();
}

const planItem = (id: string, overrides: Partial<QuoteItem> = {}) =>
  ({
    id,
    treatmentId: 'resina',
    treatmentName: 'Resina',
    toothNumber: 14,
    applicationGroupId: null,
    quantity: 1,
    subtotal: 150,
    exchangeRate: null,
    procedureId: null,
    performedAt: null,
    ...overrides,
  }) as QuoteItem;

const PLAN: Quote[] = [
  {
    id: 'q-1',
    createdAt: '2026-02-25T00:00:00Z',
    items: [
      planItem('hecho', { toothNumber: 16, procedureId: 'p1', performedAt: '2026-04-22' }),
      planItem('por-hacer'),
    ],
  } as Quote,
];

const proc = (overrides: Partial<ToothProcedure> = {}) =>
  ({
    id: 'p1',
    toothNumber: 16,
    treatmentId: 'resina',
    priceCharged: 150,
    ...overrides,
  }) as ToothProcedure;

function setup(fail = false, quotes: Quote[] = PLAN) {
  const quotesService = {
    getByPatient: vi.fn(() => (fail ? throwError(() => new Error('500')) : of(quotes))),
  };
  const reply = <T>(value: T) => (fail ? throwError(() => new Error('500')) : of(value));
  TestBed.configureTestingModule({
    imports: [RegisterTreatmentComponent],
    providers: [
      {
        provide: TreatmentsService,
        useValue: {
          getAll: () =>
            of([
              { id: 'resina', name: 'Resina', currency: 'BOB' },
              { id: 'carilla', name: 'Carilla', currency: 'USD' },
            ]),
          getToothProcedures: () => reply([proc()]),
          getFrequentIds: () => of(['resina']),
        },
      },
      {
        provide: PatientsService,
        useValue: { getCurrentDentalExam: () => reply({ id: 'exam-1' }) },
      },
      { provide: DiagnosesService, useValue: { getCatalog: () => of([{ id: 'cat-1' }]) } },
      { provide: QuotesService, useValue: quotesService },
    ],
  });
  TestBed.overrideComponent(RegisterTreatmentComponent, {
    set: { imports: [PageHeaderComponent, OdontogramStub, DecimalPipe] },
  });
  const fixture = TestBed.createComponent(RegisterTreatmentComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  fixture.detectChanges();
  const events = { done: 0, cancelled: 0 };
  fixture.componentInstance.done.subscribe(() => events.done++);
  fixture.componentInstance.cancelled.subscribe(() => events.cancelled++);
  const root = fixture.nativeElement as HTMLElement;
  const odontogram = fixture.debugElement.query(By.directive(OdontogramStub))
    .componentInstance as OdontogramStub;
  return { fixture, root, events, odontogram, quotesService };
}

describe('RegisterTreatmentComponent', () => {
  it('le pasa al odontograma el diagnóstico vigente, el catálogo y lo ya registrado', () => {
    const { odontogram, root } = setup();

    expect(odontogram.currentExam()).toEqual({ id: 'exam-1' });
    expect(odontogram.catalog()).toEqual([{ id: 'cat-1' }]);
    expect(odontogram.procedures()).toEqual([proc()]);
    expect(odontogram.frequentTreatmentIds()).toEqual(['resina']);
    expect(root.textContent).toContain('Resina');
    expect(root.textContent).toContain('Diente #16');
  });

  it('si no hay diagnóstico ni procedimientos previos, arranca vacío', () => {
    const { odontogram } = setup(true);

    expect(odontogram.currentExam()).toBeNull();
    expect(odontogram.procedures()).toEqual([]);
  });

  it('al registrar un procedimiento lo agrega a la lista y muestra el aviso', () => {
    const { fixture, root, odontogram } = setup();

    odontogram.procedureRegistered.emit({
      procedures: [proc({ id: 'p2', toothNumber: null, treatmentId: 'carilla' })],
      message: 'Tratamiento registrado.',
    });
    fixture.detectChanges();

    expect(root.textContent).toContain('Tratamiento registrado.');
    expect(root.textContent).toContain('Sin diente asociado');
    expect(root.textContent).toContain('Carilla');
    expect(root.textContent).toContain('$');
  });

  it('un tratamiento de varios dientes sale en una línea con el precio una sola vez (CLI-180)', () => {
    const { fixture, root, odontogram } = setup();

    odontogram.procedureRegistered.emit({
      procedures: [
        proc({ id: 'g-a', toothNumber: 14, applicationGroupId: 'g1', priceCharged: 300 }),
        // Cada fila del grupo reporta el precio del grupo (CLI-53): se cuenta una vez.
        proc({ id: 'g-b', toothNumber: 15, applicationGroupId: 'g1', priceCharged: 300 }),
      ],
      message: 'ok',
    });
    fixture.detectChanges();

    const items = [...root.querySelectorAll('.reg-treatment__procedure-item')];
    expect(items).toHaveLength(2);
    expect(items[1].textContent).toContain('Dientes #14, #15');
    expect(items[1].querySelector('.reg-treatment__procedure-price')?.textContent).toContain('300');
  });

  it('un tratamiento que ya no existe muestra su id', () => {
    const { fixture, root, odontogram } = setup();

    odontogram.procedureRegistered.emit({
      procedures: [proc({ id: 'p3', treatmentId: 'borrado' })],
      message: 'ok',
    });
    fixture.detectChanges();

    expect(root.textContent).toContain('borrado');
  });

  it('"Terminar" cierra el flujo como hecho; volver o cancelar, como cancelado', () => {
    const { root, events } = setup();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.reg-treatment__btn')];

    buttons.find((b) => b.classList.contains('reg-treatment__btn--primary'))!.click();
    buttons.find((b) => b.classList.contains('reg-treatment__btn--secondary'))!.click();
    root.querySelector<HTMLButtonElement>('app-page-header button')!.click();

    expect(events).toEqual({ done: 1, cancelled: 2 });
  });

  describe('plan del presupuesto (CLI-228)', () => {
    it('lista lo que falta realizar y se lo pasa al odontograma', () => {
      const { root, odontogram } = setup();

      const items = [...root.querySelectorAll('.reg-treatment__plan-item')];
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Resina');
      expect(items[0].textContent).toContain('Pieza 14');
      expect(items[0].textContent).toContain('Bs. 150.00');
      expect(odontogram.planLines().map((l) => l.key)).toEqual(['por-hacer']);
    });

    it('"Registrar" abre el panel del odontograma con esa línea', () => {
      const { root, odontogram } = setup();

      root.querySelector<HTMLButtonElement>('.reg-treatment__plan-btn')!.click();

      expect(odontogram.openForPlanLine).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'por-hacer', toothNumbers: [14] }),
      );
    });

    it('al registrar vuelve a cargar el plan', () => {
      const { fixture, odontogram, quotesService } = setup();

      odontogram.procedureRegistered.emit({ procedures: [proc({ id: 'p9' })], message: 'ok' });
      fixture.detectChanges();

      expect(quotesService.getByPatient).toHaveBeenCalledTimes(2);
    });

    it('sin nada por realizar (o si falla) no muestra la lista', () => {
      expect(setup(false, []).root.querySelector('.reg-treatment__plan')).toBeNull();
      TestBed.resetTestingModule();
      expect(setup(true).root.querySelector('.reg-treatment__plan')).toBeNull();
    });
  });
});
