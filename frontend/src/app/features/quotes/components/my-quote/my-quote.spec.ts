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

  it('muestra cada tratamiento con piezas, precio y pendiente, sin pagos', () => {
    const root = setup(of([quote()]));

    const lines = root.querySelectorAll('.mq__line');
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('Tratamiento de conducto');
    expect(lines[0].querySelector('.mq__teeth')?.textContent).toContain('pieza 36');
    const cells = [...lines[0].querySelectorAll('td')].map((c) => c.textContent?.trim());
    expect(cells.slice(1)).toEqual(['Bs. 300,00', 'Bs. 300,00']);
    expect(root.querySelector('.mq__card--balance')?.textContent).toContain('Bs. 700,00');
    expect(root.textContent).toContain('Todavía no hay pagos registrados');
    // Un solo presupuesto: sin título repetido.
    expect(root.querySelector('.mq__quote .section-title')).toBeNull();
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
    expect(lines[0].querySelector('.mq__paid')?.textContent).toBe('Pagado');
    expect(lines[1].querySelectorAll('td')[2].textContent?.trim()).toBe('Bs. 350,00');

    const payments = root.querySelectorAll('.mq__payment');
    // El más reciente primero, con fecha, método y recibo.
    expect([...payments[0].querySelectorAll('td')].map((c) => c.textContent?.trim())).toEqual([
      '28/09/2026',
      'QR BANECO',
      'REC-p2',
      'Bs. 50,00',
    ]);
    const details = root.querySelectorAll('.mq__payment-detail');
    expect(details[0].querySelector('.mq__covered')?.textContent).toContain('Gingivectomía superior (Bs. 50,00)');
    expect(details[0].querySelector('.mq__notes')?.textContent).toContain('Pago con QR');
    expect(details[1].querySelector('.mq__covered')?.textContent).toContain('Tratamiento de conducto (Bs. 300,00)');
    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(50);
  });

  it('las tarjetas suman todos los presupuestos y cada uno lleva su fecha', () => {
    const root = setup(
      of([
        quote({ id: 'q1', totalAmount: 700, totalPaid: 700, balance: 0, status: 'paid' }),
        quote({ id: 'q2', totalAmount: 300, totalPaid: 0, balance: 300, createdAt: '2026-10-01T15:00:00Z' }),
      ]),
    );
    const values = [...root.querySelectorAll('.mq__card-value')].map((v) => v.textContent);

    expect(values).toEqual(['Bs. 1.000,00', 'Bs. 700,00', 'Bs. 300,00']);
    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(70);
    expect([...root.querySelectorAll('.mq__quote .section-title')].map((t) => t.textContent)).toEqual([
      'Presupuesto del 27/09/2026',
      'Presupuesto del 01/10/2026',
    ]);
  });

  it('un presupuesto en 0 no divide por cero', () => {
    const root = setup(of([quote({ totalAmount: 0, balance: 0, items: [] })]));

    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(0);
  });
});
