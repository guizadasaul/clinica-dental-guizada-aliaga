import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { MyQuoteComponent } from './my-quote';
import { QuotesService } from '../../services/quotes.service';
import type { Quote } from '../../models/quote.model';

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

  it('muestra tratamientos, piezas, total, saldo y estado pendiente', () => {
    const root = setup(of([quote()]));

    const lines = root.querySelectorAll('.mq__line');
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('Tratamiento de conducto');
    expect(lines[0].querySelector('.mq__tooth')?.textContent).toBe('36');
    expect(root.querySelector('.mq__figure--balance')?.textContent).toContain('Bs. 700.00');
    expect(root.querySelector('.mq__status')?.textContent).toContain('Pendiente de pago');
    expect(root.querySelector('.mq__payments')).toBeNull();
  });

  it('con pagos muestra el progreso, el historial y el método legible', () => {
    const root = setup(
      of([
        quote({
          totalPaid: 350,
          balance: 350,
          status: 'partially_paid',
          payments: [
            {
              id: 'p1',
              quoteId: 'quote-1',
              amount: 350,
              paymentMethod: 'qr_baneco',
              receiptNumber: 'REC-000001',
              paymentDate: '2026-09-27T12:00:00Z',
              notes: null,
              createdAt: '2026-09-27T12:00:00Z',
            },
          ],
        }),
      ]),
    );

    expect(root.querySelector('.mq__status')?.textContent).toContain('Pago parcial');
    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(50);
    expect(root.querySelector('.mq__payment')?.textContent).toContain('QR BANECO');
    expect(root.querySelector('.mq__payment')?.textContent).toContain('REC-000001');
  });

  it('un presupuesto pagado se marca como pagado', () => {
    const root = setup(of([quote({ totalPaid: 700, balance: 0, status: 'paid' })]));

    expect(root.querySelector('.mq__status--paid')).not.toBeNull();
  });

  it('un presupuesto en 0 no divide por cero', () => {
    const root = setup(of([quote({ totalAmount: 0, balance: 0, items: [] })]));

    expect(root.querySelector<HTMLProgressElement>('progress')?.value).toBe(0);
  });
});
