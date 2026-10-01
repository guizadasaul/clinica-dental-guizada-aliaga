import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DatePipe, DecimalPipe } from '@angular/common';
import { NEVER, of, throwError } from 'rxjs';
import { FinancesPageComponent } from './finances-page';
import { FinancesService } from '../../services/finances.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import type { PatientBalance, PatientFinanceDetail } from '../../models/finance.model';
import type { Quote } from '../../../quotes/models/quote.model';

@Component({ selector: 'app-register-payment', standalone: true, template: 'panel' })
class RegisterPaymentStub {
  readonly quoteId = input<string>('');
  readonly balance = input<number>(0);
  readonly paid = output<Quote>();
  readonly closed = output<void>();
}

const PATIENTS: PatientBalance[] = [
  {
    patientId: 'p1',
    patientName: 'Ana Pérez',
    quoteId: 'quote-1',
    totalAmount: 700,
    totalPaid: 200,
    balance: 500,
    sharedAt: null,
  },
];

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'p1',
    totalAmount: 700,
    totalPaid: 200,
    balance: 500,
    status: 'partially_paid',
    notes: null,
    createdAt: '2026-09-27T12:00:00Z',
    updatedAt: '2026-09-27T12:00:00Z',
    sharedAt: null,
    items: [
      {
        id: 'i1',
        quoteId: 'quote-1',
        treatmentId: 't1',
        treatmentName: 'Tratamiento de conducto',
        toothNumber: 36,
        applicationGroupId: null,
        unitPrice: 700,
        quantity: 1,
        subtotal: 700,
        currency: 'BOB',
        exchangeRate: null,
      },
    ],
    payments: [
      {
        id: 'pay-old',
        quoteId: 'quote-1',
        amount: 50,
        paymentMethod: 'efectivo',
        receiptNumber: 'REC-000001',
        paymentDate: '2026-09-01T12:00:00Z',
        notes: null,
        createdAt: '2026-09-01T12:00:00Z',
      },
      {
        id: 'pay-new',
        quoteId: 'quote-1',
        amount: 150,
        paymentMethod: 'qr_baneco',
        receiptNumber: 'REC-000002',
        paymentDate: '2026-09-20T12:00:00Z',
        notes: null,
        createdAt: '2026-09-20T12:00:00Z',
      },
    ],
    ...overrides,
  };
}

const DETAIL: PatientFinanceDetail = { patientId: 'p1', patientName: 'Ana Pérez', quote: quote() };

function setup(list = of(PATIENTS)) {
  vi.useFakeTimers();
  const finances = {
    listPatients: vi.fn().mockReturnValue(list),
    getPatientDetail: vi.fn().mockReturnValue(of(DETAIL)),
  };
  TestBed.configureTestingModule({
    imports: [FinancesPageComponent],
    providers: [{ provide: FinancesService, useValue: finances }],
  });
  TestBed.overrideComponent(FinancesPageComponent, {
    set: { imports: [PageHeaderComponent, DecimalPipe, DatePipe, RegisterPaymentStub] },
  });
  const fixture = TestBed.createComponent(FinancesPageComponent);
  const root = fixture.nativeElement as HTMLElement;
  const tick = () => {
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
  };
  tick();
  return { fixture, root, finances, tick };
}

describe('FinancesPageComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('lista los pacientes con lo que deben', () => {
    const { root, finances } = setup();

    expect(finances.listPatients).toHaveBeenCalledWith('');
    expect(root.querySelector('.fin__patient')?.textContent).toContain('Ana Pérez');
    expect(root.querySelector('.fin__patient-balance')?.textContent).toContain('Bs. 500.00');
    expect(root.textContent).toContain('Elegí un paciente');
  });

  it('mientras carga y si falla la lista', () => {
    expect(setup(NEVER).root.textContent).toContain('Cargando pacientes');
    TestBed.resetTestingModule();
    vi.useRealTimers();
    expect(setup(throwError(() => new Error('500'))).root.textContent).toContain(
      'No se pudo cargar la lista',
    );
  });

  it('sin pacientes con saldo muestra el vacío', () => {
    const { root } = setup(of([]));

    expect(root.textContent).toContain('No hay pacientes con saldo pendiente');
  });

  it('buscar consulta con el término después del debounce', () => {
    const { root, finances, tick } = setup();
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;

    input.value = 'ana';
    input.dispatchEvent(new Event('input'));
    tick();

    expect(finances.listPatients).toHaveBeenLastCalledWith('ana');
  });

  it('elegir un paciente muestra totales, tratamientos y pagos (el más nuevo primero)', () => {
    const { root, finances, tick } = setup();

    root.querySelector<HTMLButtonElement>('.fin__patient')!.click();
    tick();

    expect(finances.getPatientDetail).toHaveBeenCalledWith('p1');
    expect(root.querySelector('.fin__card--balance')?.textContent).toContain('Bs. 500.00');
    expect(root.querySelector('.fin__line')?.textContent).toContain('pieza 36');
    const rows = root.querySelectorAll('.fin__table tbody tr');
    expect(rows[0].textContent).toContain('QR BANECO');
    expect(rows[1].textContent).toContain('efectivo');
  });

  it('si el detalle falla, avisa', () => {
    const { root, finances, tick } = setup();
    finances.getPatientDetail.mockReturnValue(throwError(() => new Error('500')));

    root.querySelector<HTMLButtonElement>('.fin__patient')!.click();
    tick();

    expect(root.textContent).toContain('No se pudo cargar el detalle');
  });

  it('paciente sin presupuesto', () => {
    const { root, finances, tick } = setup();
    finances.getPatientDetail.mockReturnValue(of({ ...DETAIL, quote: null }));

    root.querySelector<HTMLButtonElement>('.fin__patient')!.click();
    tick();

    expect(root.textContent).toContain('no tiene presupuesto');
  });

  it('registrar pago abre el panel; al pagar actualiza el detalle y recarga la lista', () => {
    const { fixture, root, finances, tick } = setup();
    root.querySelector<HTMLButtonElement>('.fin__patient')!.click();
    tick();

    root.querySelector<HTMLButtonElement>('.fin__pay-btn')!.click();
    tick();
    const panel = fixture.debugElement.query(By.directive(RegisterPaymentStub))
      .componentInstance as RegisterPaymentStub;
    expect(panel.balance()).toBe(500);

    panel.paid.emit(quote({ totalPaid: 700, balance: 0, status: 'paid' }));
    tick();

    expect(root.querySelector('app-register-payment')).toBeNull();
    expect(root.textContent).toContain('Pago de Bs. 500.00 registrado');
    expect(root.textContent).toContain('Presupuesto pagado por completo');
    expect(finances.listPatients).toHaveBeenCalledTimes(2);
  });

  it('cerrar el panel vuelve al botón', () => {
    const { fixture, root, tick } = setup();
    root.querySelector<HTMLButtonElement>('.fin__patient')!.click();
    tick();
    root.querySelector<HTMLButtonElement>('.fin__pay-btn')!.click();
    tick();

    (fixture.debugElement.query(By.directive(RegisterPaymentStub)).componentInstance as RegisterPaymentStub).closed.emit();
    tick();

    expect(root.querySelector('.fin__pay-btn')).not.toBeNull();
  });
});
