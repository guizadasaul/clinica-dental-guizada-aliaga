import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RegisterPaymentComponent } from './register-payment';
import { QuotesService } from '../../../quotes/services/quotes.service';
import { FinancesService } from '../../services/finances.service';
import type { Quote } from '../../../quotes/models/quote.model';

const UPDATED = { id: 'quote-1', totalPaid: 700, balance: 0 } as Quote;
const CHARGE = {
  chargeId: 'charge-1',
  quoteId: 'quote-1',
  amount: 150,
  qrImageBase64: 'QRDATA',
  status: 'pending' as const,
  lines: [],
};

function setup(balance = 500) {
  const quotes = { addPayment: vi.fn().mockReturnValue(of(UPDATED)) };
  const finances = {
    createQrCharge: vi.fn().mockReturnValue(of(CHARGE)),
    verifyQrCharge: vi.fn(),
    cancelQrCharge: vi.fn().mockReturnValue(of(undefined)),
  };
  TestBed.configureTestingModule({
    imports: [RegisterPaymentComponent],
    providers: [
      { provide: QuotesService, useValue: quotes },
      { provide: FinancesService, useValue: finances },
    ],
  });
  const fixture = TestBed.createComponent(RegisterPaymentComponent);
  fixture.componentRef.setInput('quoteId', 'quote-1');
  fixture.componentRef.setInput('balance', balance);
  const paid: Quote[] = [];
  let closed = 0;
  fixture.componentInstance.paid.subscribe((q) => paid.push(q));
  fixture.componentInstance.closed.subscribe(() => closed++);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  };
  const button = (label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))!;
  const type = async (id: string, value: string) => {
    const el = root.querySelector<HTMLInputElement>(`#${id}`)!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await settle();
  };
  return { fixture, root, quotes, finances, paid, closed: () => closed, settle, button, type };
}

describe('RegisterPaymentComponent', () => {
  it('por defecto propone cobrar el saldo completo en efectivo', async () => {
    const { root, settle } = setup(500);
    await settle();

    expect(root.querySelector<HTMLInputElement>('#rp-amount')!.value).toBe('500');
    expect(root.querySelector('.rp__mode--active')?.textContent).toContain('Efectivo');
  });

  describe('efectivo', () => {
    it('registra el pago con notas y emite el presupuesto actualizado', async () => {
      const { quotes, paid, settle, button, type } = setup();
      await settle();
      await type('rp-amount', '200');
      await type('rp-notes', '  primer pago ');

      button('Registrar pago en efectivo').click();
      await settle();

      expect(quotes.addPayment).toHaveBeenCalledWith('quote-1', {
        amount: 200,
        paymentMethod: 'cash',
        notes: 'primer pago',
      });
      expect(paid).toEqual([UPDATED]);
    });

    it.each([
      ['0', 'mayor a 0'],
      ['600', 'no puede superar el saldo'],
    ])('monto %s: avisa y no llama al backend', async (value, message) => {
      const { root, quotes, settle, button, type } = setup(500);
      await settle();
      await type('rp-amount', value);

      button('Registrar pago en efectivo').click();
      await settle();

      expect(quotes.addPayment).not.toHaveBeenCalled();
      expect(root.querySelector('.rp__error')?.textContent).toContain(message);
    });

    it('si el backend falla, avisa', async () => {
      const { root, quotes, settle, button } = setup();
      quotes.addPayment.mockReturnValue(throwError(() => new Error('500')));
      await settle();

      button('Registrar pago en efectivo').click();
      await settle();

      expect(root.querySelector('.rp__error')?.textContent).toContain('No se pudo registrar el pago');
    });
  });

  describe('QR BANECO', () => {
    async function withQr(fixtureSetup = setup()) {
      const s = fixtureSetup;
      await s.settle();
      s.button('QR BANECO').click();
      await s.settle();
      await s.type('rp-amount', '150');
      s.button('Generar QR').click();
      await s.settle();
      return s;
    }

    it('genera el QR por el monto elegido y bloquea cambiar de método', async () => {
      const { root, finances, button } = await withQr();

      expect(finances.createQrCharge).toHaveBeenCalledWith('quote-1', 150);
      expect(root.querySelector<HTMLImageElement>('.rp__qr-img')!.src).toContain('base64,QRDATA');
      expect(button('Efectivo').disabled).toBe(true);
    });

    it('junto al QR avisa al paciente que la clínica no realiza reembolsos (CLI-103)', async () => {
      const { root } = await withQr();

      expect(root.querySelector('.rp__no-refund')?.textContent).toContain('La clínica no realiza reembolsos');
    });

    it('verificar sin pago: avisa y no emite nada (sin polling)', async () => {
      const s = setup();
      s.finances.verifyQrCharge.mockReturnValue(of({ status: 'pending' }));
      const { root, paid, finances, button, settle } = await withQr(s);

      button('Verificar pago').click();
      await settle();

      expect(finances.verifyQrCharge).toHaveBeenCalledTimes(1);
      expect(root.querySelector('.rp__notice')?.textContent).toContain('Todavía no llegó el pago');
      expect(paid).toEqual([]);
    });

    it('verificar pagado: emite el presupuesto actualizado', async () => {
      const s = setup();
      s.finances.verifyQrCharge.mockReturnValue(of({ status: 'paid', quote: UPDATED }));
      const { paid, button, settle } = await withQr(s);

      button('Verificar pago').click();
      await settle();

      expect(paid).toEqual([UPDATED]);
    });

    it('verificar anulado: vuelve al formulario con aviso', async () => {
      const s = setup();
      s.finances.verifyQrCharge.mockReturnValue(of({ status: 'cancelled' }));
      const { root, button, settle } = await withQr(s);

      button('Verificar pago').click();
      await settle();

      expect(root.querySelector('.rp__qr')).toBeNull();
      expect(root.querySelector('.rp__notice')?.textContent).toContain('El QR fue anulado');
    });

    it('si verificar falla, avisa y deja el QR', async () => {
      const s = setup();
      s.finances.verifyQrCharge.mockReturnValue(throwError(() => new Error('503')));
      const { root, button, settle } = await withQr(s);

      button('Verificar pago').click();
      await settle();

      expect(root.querySelector('.rp__error')?.textContent).toContain('No se pudo consultar');
      expect(root.querySelector('.rp__qr')).not.toBeNull();
    });

    it('anular el QR vuelve al formulario', async () => {
      const { root, finances, button, settle } = await withQr();

      button('Anular QR').click();
      await settle();

      expect(finances.cancelQrCharge).toHaveBeenCalledWith('charge-1');
      expect(root.querySelector('.rp__qr')).toBeNull();
    });

    it('si generar falla, avisa', async () => {
      const s = setup();
      s.finances.createQrCharge.mockReturnValue(throwError(() => new Error('503')));
      const { root } = await withQr(s);

      expect(root.querySelector('.rp__error')?.textContent).toContain('No se pudo generar el QR');
    });
  });

  it('cerrar emite closed', async () => {
    const { root, closed, settle } = setup();
    await settle();

    root.querySelector<HTMLButtonElement>('.rp__close')!.click();

    expect(closed()).toBe(1);
  });
});
