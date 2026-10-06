import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { MyQuoteComponent } from './my-quote';
import { QuotesService } from '../../services/quotes.service';
import type { Payment, Quote } from '../../models/quote.model';

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'patient-1',
    totalAmount: 700,
    totalPaid: 0,
    balance: 700,
    status: 'pending',
    notes: null,
    createdAt: '2026-09-27T12:00:00Z',
    updatedAt: '2026-09-27T12:00:00Z',
    sharedAt: '2026-09-27T12:00:00Z',
    items: [
      {
        id: 'item-1',
        quoteId: 'quote-1',
        treatmentId: 't1',
        treatmentName: 'Tratamiento de conducto',
        toothNumber: 36,
        applicationGroupId: null,
        unitPrice: 300,
        quantity: 1,
        subtotal: 300,
        currency: 'BOB',
        exchangeRate: null,
      },
      {
        id: 'item-2',
        quoteId: 'quote-1',
        treatmentId: 't2',
        treatmentName: 'Gingivectomía superior',
        toothNumber: null,
        applicationGroupId: null,
        unitPrice: 400,
        quantity: 1,
        subtotal: 400,
        currency: 'BOB',
        exchangeRate: null,
      },
    ],
    payments: [],
    ...overrides,
  };
}

function setup(response: Observable<Quote[]>) {
  TestBed.configureTestingModule({
    imports: [MyQuoteComponent],
    providers: [{ provide: QuotesService, useValue: { getMine: () => response } }],
  });
  const fixture = TestBed.createComponent(MyQuoteComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MyQuoteComponent', () => {
  it('mientras carga muestra un spinner', () => {
    const root = setup(NEVER);

    expect(root.textContent).toContain('Cargando tu presupuesto');
  });

  it('sin presupuestos compartidos muestra el estado vacío', () => {
    const root = setup(of([]));

    expect(root.textContent).toContain('Tu doctor todavía no compartió un presupuesto');
  });

  it('si falla, avisa', () => {
    const root = setup(throwError(() => new Error('500')));

    expect(root.textContent).toContain('No pudimos cargar tu presupuesto');
  });

  const pay = (id: string, amount: number, paymentDate: string, extra: Partial<Payment> = {}): Payment => ({
    id,
    quoteId: 'quote-1',
    amount,
    paymentMethod: 'cash',
    receiptNumber: `REC-${id}`,
    paymentDate,
    notes: null,
    createdAt: paymentDate,
    ...extra,
  });

  it('muestra cada tratamiento con piezas, precio, pendiente y estado, sin pagos', () => {
    const root = setup(of([quote()]));

    const lines = root.querySelectorAll('.mq__line');
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('Tratamiento de conducto');
    expect(lines[0].querySelector('.mq__tooth')?.textContent).toBe('Pieza 36');
    expect(lines[0].querySelector('.mq__num--pending')?.textContent).toBe('Bs. 300,00');
    expect(lines[0].querySelector('.mq__chip')?.textContent).toBe('Pendiente');
    expect(root.querySelector('.mq__figure--balance')?.textContent).toContain('Bs. 700,00');
    expect(root.querySelector('.mq__quote-head .mq__chip')?.textContent).toContain('Pendiente de pago');
    expect(root.textContent).toContain('Todavía no registraste pagos');
  });

  it('reparte los pagos por tratamiento y muestra qué cubrió cada uno', () => {
    const root = setup(
      of([
        quote({
          totalPaid: 350,
          balance: 350,
          status: 'partially_paid',
          payments: [
            pay('p2', 50, '2026-09-28T15:00:00Z', { paymentMethod: 'qr_baneco', notes: 'Pago con QR' }),
            pay('p1', 300, '2026-09-20T15:00:00Z'),
          ],
        }),
      ]),
    );

    const lines = root.querySelectorAll('.mq__line');
    expect(lines[0].querySelector('.mq__chip')?.textContent).toBe('Pagado');
    expect(lines[1].querySelector('.mq__chip')?.textContent).toBe('Parcial');
    expect(lines[1].querySelector('.mq__num--paid')?.textContent).toBe('Bs. 50,00');
    expect(lines[1].querySelector('.mq__num--pending')?.textContent).toBe('Bs. 350,00');

    const payments = root.querySelectorAll('.mq__payment');
    // El más reciente primero, con fecha legible, método y recibo.
    expect(payments[0].textContent).toContain('28 de septiembre de 2026');
    expect(payments[0].textContent).toContain('QR BANECO · Recibo REC-p2');
    expect(payments[0].querySelector('.mq__covered')?.textContent).toContain('Gingivectomía superior (Bs. 50,00)');
    expect(payments[0].querySelector('.mq__payment-notes')?.textContent).toContain('Pago con QR');
    expect(payments[1].querySelector('.mq__covered')?.textContent).toContain('Tratamiento de conducto (Bs. 300,00)');
    expect(root.querySelector('.mq__quote-head .mq__chip')?.textContent).toContain('Pago parcial');
    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(50);
  });

  it('el resumen suma todos los presupuestos compartidos', () => {
    const root = setup(
      of([
        quote({ id: 'q1', totalAmount: 700, totalPaid: 700, balance: 0, status: 'paid' }),
        quote({ id: 'q2', totalAmount: 300, totalPaid: 0, balance: 300 }),
      ]),
    );

    expect(root.querySelector('.mq__figure-value')?.textContent).toContain('Bs. 1.000,00');
    expect(root.querySelector('.mq__figure--paid')?.textContent).toContain('Bs. 700,00');
    expect(root.querySelector('.mq__figure--balance')?.textContent).toContain('Bs. 300,00');
    expect(root.querySelector('.mq__progress-label')?.textContent).toContain('70% pagado');
    expect(root.querySelectorAll('.mq__quote')).toHaveLength(2);
    expect(root.querySelector('.mq__quote-head .mq__chip--paid')).not.toBeNull();
  });

  it('un presupuesto en 0 no divide por cero', () => {
    const root = setup(of([quote({ totalAmount: 0, balance: 0, items: [] })]));

    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(0);
  });
});
