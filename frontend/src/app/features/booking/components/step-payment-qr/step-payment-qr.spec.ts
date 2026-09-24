import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StepPaymentQrComponent } from './step-payment-qr';
import { BookingService } from '../../services/booking.service';

function setup(paid: boolean) {
  const booking = { getStatus: vi.fn().mockReturnValue(of({ paid })) };
  TestBed.configureTestingModule({
    imports: [StepPaymentQrComponent],
    providers: [{ provide: BookingService, useValue: booking }],
  });
  const fixture = TestBed.createComponent(StepPaymentQrComponent);
  fixture.componentRef.setInput('appointmentId', 'appt-1');
  fixture.componentRef.setInput('qrImageBase64', 'QUJD');
  fixture.componentRef.setInput('amount', 150);
  fixture.detectChanges();
  let confirmed = 0;
  fixture.componentInstance.confirmed.subscribe(() => confirmed++);
  const root = fixture.nativeElement as HTMLElement;
  const check = async () => {
    root.querySelector<HTMLButtonElement>('.payment-qr__check-btn')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { root, booking, check, confirmed: () => confirmed };
}

describe('StepPaymentQrComponent', () => {
  it('muestra el monto y el QR de BANECO a escanear', () => {
    const { root } = setup(false);

    expect(root.textContent).toContain('Bs 150');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,QUJD');
    expect(root.querySelector('.payment-qr__call-btn')?.getAttribute('href')).toMatch(/^tel:/);
  });

  it('"Ya pagué" con el pago acreditado confirma la cita', async () => {
    const { booking, check, confirmed } = setup(true);

    await check();

    expect(booking.getStatus).toHaveBeenCalledWith('appt-1');
    expect(confirmed()).toBe(1);
  });

  it('"Ya pagué" sin pago todavía avisa y deja volver a verificar', async () => {
    const { root, check, confirmed } = setup(false);

    await check();

    expect(confirmed()).toBe(0);
    expect(root.textContent).toContain('Todavía no detectamos tu pago');
    expect(root.querySelector<HTMLButtonElement>('.payment-qr__check-btn')!.disabled).toBe(false);
  });
});
