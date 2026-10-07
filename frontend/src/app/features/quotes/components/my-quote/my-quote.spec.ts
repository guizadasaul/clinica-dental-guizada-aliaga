import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { MyQuoteComponent } from './my-quote';
import { QuotesService } from '../../services/quotes.service';
import type { Payment, Quote, QuoteLine } from '../../models/quote.model';
import type { QrCharge } from '../../../finances/models/finance.model';

function line(key: string, total: number, pending = total, extra: Partial<QuoteLine> = {}): QuoteLine {
  return { key, treatmentName: `Tratamiento ${key}`, toothNumbers: [], total, paid: total - pending, pending, performedAt: null, ...extra };
}

function pay(id: string, amount: number, paymentDate: string, extra: Partial<Payment> = {}): Payment {
  return {
    id,
    quoteId: 'quote-1',
    amount,
    paymentMethod: 'cash',
    receiptNumber: `REC-${id}`,
    paymentDate,
    notes: null,
    createdAt: paymentDate,
    covered: [],
    ...extra,
  };
}

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
    items: [],
    payments: [],
    lines: [
      line('conducto', 300, 300, { treatmentName: 'Tratamiento de conducto', toothNumbers: [36] }),
      line('gingi', 400, 400, { treatmentName: 'Gingivectomía superior' }),
    ],
    ...overrides,
  };
}

function charge(overrides: Partial<QrCharge> = {}): QrCharge {
  return {
    chargeId: 'charge-1',
    quoteId: 'quote-1',
    amount: 700,
    qrImageBase64: 'QRDATA',
    status: 'pending',
    lines: [
      { lineKey: 'conducto', amount: 300 },
      { lineKey: 'gingi', amount: 400 },
    ],
    ...overrides,
  };
}

function setup(response: Observable<Quote[]>, pending: Observable<QrCharge | null> = of(null)) {
  const service = {
    getMine: vi.fn(() => response),
    getMyPendingQrCharge: vi.fn(() => pending),
    createMyQrCharge: vi.fn(() => of(charge())),
    verifyMyQrCharge: vi.fn(() => of({ status: 'pending' })),
    cancelMyQrCharge: vi.fn(() => of({ status: 'cancelled' })),
  };
  TestBed.configureTestingModule({
    imports: [MyQuoteComponent],
    providers: [{ provide: QuotesService, useValue: service }],
  });
  const fixture = TestBed.createComponent(MyQuoteComponent);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, service };
}

async function settle(fixture: ComponentFixture<MyQuoteComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))!;
}

describe('MyQuoteComponent', () => {
  it('mientras carga lo dice', () => {
    expect(setup(NEVER).root.textContent).toContain('Cargando tu presupuesto');
  });

  it('sin presupuestos compartidos muestra el estado vacío', () => {
    expect(setup(of([])).root.textContent).toContain('Tu doctor todavía no compartió un presupuesto');
  });

  it('si falla, avisa', () => {
    expect(setup(throwError(() => new Error('500'))).root.textContent).toContain('No pudimos cargar tu presupuesto');
  });

  it('muestra cada tratamiento con piezas, precio y lo pendiente que calcula el backend', () => {
    const { root } = setup(
      of([quote({ totalPaid: 300, balance: 400, lines: [line('conducto', 300, 0, { toothNumbers: [36] }), line('gingi', 400)] })]),
    );
    const rows = root.querySelectorAll('.mq__line');

    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.mq__teeth')?.textContent).toContain('pieza 36');
    expect(rows[0].querySelector('.mq__paid')?.textContent).toBe('Pagado');
    // Lo ya pagado no se puede elegir.
    expect(rows[0].querySelector('input[type=checkbox]')).toBeNull();
    expect(rows[1].querySelectorAll('td')[3].textContent?.trim()).toBe('Bs. 400,00');
    expect(root.querySelector('.mq__card--balance')?.textContent).toContain('Bs. 400,00');
  });

  // CLI-229: el presupuesto es el plan del doctor; el paciente ve qué ya se hizo.
  it('cada tratamiento dice si ya se realizó (con fecha) o si falta', () => {
    const { root } = setup(
      of([
        quote({
          lines: [
            line('corona', 950, 950, { performedAt: '2026-04-22T00:00:00.000Z' }),
            line('limpieza', 350),
          ],
        }),
      ]),
    );
    const status = [...root.querySelectorAll('.mq__line .mq__status')].map((s) => s.textContent?.trim());

    expect(status).toEqual(['Realizado el 22/04/2026', 'Por realizar']);
    // Se puede pagar aunque todavía no se haya realizado.
    expect(root.querySelectorAll('.mq__line input[type=checkbox]')).toHaveLength(2);
  });

  it('muestra los pagos del más reciente al más antiguo con lo que cubrió cada uno', () => {
    const { root } = setup(
      of([
        quote({
          payments: [
            pay('p1', 300, '2026-09-20T15:00:00Z', {
              covered: [{ lineKey: 'conducto', treatmentName: 'Tratamiento de conducto', amount: 300 }],
            }),
            pay('p2', 50, '2026-09-28T15:00:00Z', { paymentMethod: 'qr_baneco', notes: 'Pago con QR' }),
          ],
        }),
      ]),
    );
    const payments = root.querySelectorAll('.mq__payment');

    expect([...payments[0].querySelectorAll('td')].map((c) => c.textContent?.trim())).toEqual([
      '28/09/2026',
      'QR BANECO',
      'REC-p2',
      'Bs. 50,00',
    ]);
    const details = root.querySelectorAll('.mq__payment-detail');
    expect(details[0].querySelector('.mq__notes')?.textContent).toContain('Pago con QR');
    expect(details[1].querySelector('.mq__covered')?.textContent).toContain('Tratamiento de conducto (Bs. 300,00)');
  });

  it('las tarjetas suman todos los presupuestos y cada uno lleva su fecha', () => {
    const { root } = setup(
      of([
        quote({ id: 'q1', totalPaid: 700, balance: 0, lines: [line('a', 700, 0)] }),
        quote({ id: 'q2', totalAmount: 300, balance: 300, createdAt: '2026-10-01T15:00:00Z', lines: [line('b', 300)] }),
      ]),
    );

    expect([...root.querySelectorAll('.mq__card-value')].map((v) => v.textContent)).toEqual([
      'Bs. 1.000,00',
      'Bs. 700,00',
      'Bs. 300,00',
    ]);
    expect([...root.querySelectorAll('.mq__quote .section-title')].map((t) => t.textContent)).toEqual([
      'Presupuesto del 27/09/2026',
      'Presupuesto del 01/10/2026',
    ]);
  });

  it('pagina los tratamientos de a 10', async () => {
    const lines = Array.from({ length: 13 }, (_, i) => line(`l${i + 1}`, 100));
    const { fixture, root } = setup(of([quote({ totalAmount: 1300, balance: 1300, lines })]));
    // El nombre es el primer texto de la celda (debajo va si se realizó, CLI-229).
    const names = () => [...root.querySelectorAll('.mq__line td:nth-child(2)')].map((c) => c.firstChild?.textContent?.trim());

    expect(names()).toHaveLength(10);
    root.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')!.click();
    await settle(fixture);
    expect(names()).toEqual(['Tratamiento l11', 'Tratamiento l12', 'Tratamiento l13']);
  });

  describe('pago con QR (CLI-219)', () => {
    function check(root: HTMLElement, index: number): void {
      root.querySelectorAll<HTMLInputElement>('.mq__line input[type=checkbox]')[index].click();
    }

    it('al elegir tratamientos muestra el total y genera el QR con esas líneas', async () => {
      const { fixture, root, service } = setup(of([quote()]));

      expect(root.querySelector('.mq__paybar')).toBeNull();
      check(root, 1);
      await settle(fixture);
      expect(root.querySelector('.mq__paybar')?.textContent).toContain('1 tratamiento elegido · Bs. 400,00');

      button(root, 'Pagar con QR').click();
      await settle(fixture);

      expect(service.createMyQrCharge).toHaveBeenCalledWith('quote-1', ['gingi']);
      const modal = root.querySelector('.qr-modal')!;
      expect(modal.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,QRDATA');
      expect(modal.querySelector('.qr-modal__amount')?.textContent).toContain('Bs. 700,00');
      expect(modal.querySelector('.qr-modal__lines')?.textContent).toContain('Gingivectomía superior');
    });

    it('"elegir todos" toma todo lo pendiente, y otra vez lo deselecciona', async () => {
      const { fixture, root } = setup(of([quote()]));
      const all = root.querySelector<HTMLInputElement>('.mq__table thead input[type=checkbox]')!;

      all.click();
      await settle(fixture);
      expect(root.querySelector('.mq__paybar')?.textContent).toContain('2 tratamientos elegidos · Bs. 700,00');
      all.click();
      await settle(fixture);
      expect(root.querySelector('.mq__paybar')).toBeNull();
    });

    it('verificar: pendiente lo avisa; pagado cierra, avisa y recarga el presupuesto', async () => {
      const { fixture, root, service } = setup(of([quote()]));
      check(root, 0);
      await settle(fixture);
      button(root, 'Pagar con QR').click();
      await settle(fixture);

      button(root, 'Ya pagué, verificar').click();
      await settle(fixture);
      expect(root.querySelector('.qr-modal__message')?.textContent).toContain('Todavía no recibimos el pago');

      service.verifyMyQrCharge.mockReturnValue(of({ status: 'paid', quote: quote() }));
      button(root, 'Ya pagué, verificar').click();
      await settle(fixture);

      expect(service.verifyMyQrCharge).toHaveBeenCalledWith('charge-1');
      expect(root.querySelector('.qr-modal')).toBeNull();
      expect(root.querySelector('.mq__success')?.textContent).toContain('¡Pago confirmado!');
      expect(service.getMine).toHaveBeenCalledTimes(2);
    });

    // CLI-220: un QR que quedó vivo se verifica solo al entrar.
    describe('al entrar con un QR sin pagar', () => {
      it('si ya se pagó, lo confirma sin que presione verificar', async () => {
        const { fixture, root, service } = setup(of([quote()]), of(charge()));
        service.verifyMyQrCharge.mockReturnValue(of({ status: 'paid', quote: quote() }));
        await settle(fixture);
        await settle(fixture);

        expect(service.verifyMyQrCharge).toHaveBeenCalledWith('charge-1');
        expect(root.querySelector('.mq__success')?.textContent).toContain('¡Pago confirmado!');
        expect(root.querySelector('.qr-modal')).toBeNull();
      });

      it('si sigue sin pagar, vuelve a mostrar el QR con un aviso', async () => {
        const { fixture, root } = setup(of([quote()]), of(charge()));
        await settle(fixture);
        await settle(fixture);

        expect(root.querySelector('.qr-modal__message')?.textContent).toContain('Tienes un QR sin pagar');
        expect(root.querySelector('.qr-modal__amount')?.textContent).toContain('Bs. 700,00');
      });

      it('si BANECO lo anuló, no muestra nada', async () => {
        const { fixture, root, service } = setup(of([quote()]), of(charge()));
        service.verifyMyQrCharge.mockReturnValue(of({ status: 'cancelled' }));
        await settle(fixture);
        await settle(fixture);

        expect(root.querySelector('.qr-modal')).toBeNull();
      });
    });

    describe('cerrar el QR lo anula (CLI-220)', () => {
      async function withOpenQr() {
        const ctx = setup(of([quote()]));
        check(ctx.root, 0);
        await settle(ctx.fixture);
        button(ctx.root, 'Pagar con QR').click();
        await settle(ctx.fixture);
        return ctx;
      }

      it('la X anula el QR y lo avisa', async () => {
        const { fixture, root, service } = await withOpenQr();

        root.querySelector<HTMLButtonElement>('.qr-modal__close')!.click();
        await settle(fixture);

        expect(service.cancelMyQrCharge).toHaveBeenCalledWith('charge-1');
        expect(root.querySelector('.qr-modal')).toBeNull();
        expect(root.querySelector('.mq__success')?.textContent).toContain('Cerraste el QR y quedó anulado');
      });

      it('el clic en el fondo también lo anula; dentro del panel no', async () => {
        const { fixture, root, service } = await withOpenQr();

        root.querySelector<HTMLElement>('.qr-modal__panel')!.click();
        await settle(fixture);
        expect(service.cancelMyQrCharge).not.toHaveBeenCalled();

        root.querySelector<HTMLElement>('.qr-modal')!.click();
        await settle(fixture);
        expect(service.cancelMyQrCharge).toHaveBeenCalledWith('charge-1');
      });

      it('si al cerrar resulta que ya había pagado, confirma el pago en vez de anular', async () => {
        const { fixture, root, service } = await withOpenQr();
        service.cancelMyQrCharge.mockReturnValue(of({ status: 'paid', quote: quote() }));

        root.querySelector<HTMLButtonElement>('.qr-modal__close')!.click();
        await settle(fixture);

        expect(root.querySelector('.mq__success')?.textContent).toContain('¡Pago confirmado!');
        expect(service.getMine).toHaveBeenCalledTimes(2);
      });

      it('si no se pudo anular, el QR sigue abierto y lo dice', async () => {
        const { fixture, root, service } = await withOpenQr();
        service.cancelMyQrCharge.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

        root.querySelector<HTMLButtonElement>('.qr-modal__close')!.click();
        await settle(fixture);

        expect(root.querySelector('.qr-modal')).not.toBeNull();
        expect(root.querySelector('.qr-modal__message')?.textContent).toContain('No pudimos anular el QR');
      });

      it('"Anular QR" hace lo mismo', async () => {
        const { fixture, root, service } = await withOpenQr();

        button(root, 'Anular QR').click();
        await settle(fixture);

        expect(service.cancelMyQrCharge).toHaveBeenCalledWith('charge-1');
        expect(root.querySelector('.mq__success')?.textContent).toContain('Anulaste el QR');
      });
    });

    it('si ya tenía un QR pendiente (409), le muestra ese', async () => {
      const { fixture, root, service } = setup(of([quote()]));
      service.createMyQrCharge.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      service.getMyPendingQrCharge.mockReturnValue(of(charge({ amount: 300 })));
      check(root, 0);
      await settle(fixture);

      button(root, 'Pagar con QR').click();
      await settle(fixture);
      // Pide el QR pendiente después del 409: una espera más.
      await settle(fixture);

      expect(root.querySelector('.qr-modal__message')?.textContent).toContain('Ya tenías un QR sin pagar');
      expect(root.querySelector('.qr-modal__amount')?.textContent).toContain('Bs. 300,00');
    });

    it('si falla al generar, lo dice', async () => {
      const { fixture, root, service } = setup(of([quote()]));
      service.createMyQrCharge.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
      check(root, 0);
      await settle(fixture);

      button(root, 'Pagar con QR').click();
      await settle(fixture);

      expect(root.querySelector('.mq__error')?.textContent).toContain('No pudimos generar el QR');
      expect(root.querySelector('.qr-modal')).toBeNull();
    });
  });
});
