import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StepPaymentQrComponent } from './step-payment-qr';
import { BookingService } from '../../services/booking.service';

function setup(paid: boolean, contact: { doctorName: string | null; doctorPhone: string | null } = { doctorName: null, doctorPhone: null }) {
  const booking = { getStatus: vi.fn().mockReturnValue(of({ paid })) };
  TestBed.configureTestingModule({
    imports: [StepPaymentQrComponent],
    providers: [{ provide: BookingService, useValue: booking }],
  });
  const fixture = TestBed.createComponent(StepPaymentQrComponent);
  fixture.componentRef.setInput('appointmentId', 'appt-1');
  fixture.componentRef.setInput('qrImageBase64', 'QUJD');
  fixture.componentRef.setInput('amount', 150);
  fixture.componentRef.setInput('doctorName', contact.doctorName);
  fixture.componentRef.setInput('doctorPhone', contact.doctorPhone);
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
  });

  describe('botón Contáctanos (CLI-166)', () => {
    function contact(doctorName: string | null, doctorPhone: string | null) {
      const s = setup(false, { doctorName, doctorPhone });
      return s.root.querySelector<HTMLAnchorElement>('.payment-qr__contact-btn')!;
    }

    it('dice "Contáctanos" y no muestra ningún número', () => {
      const link = contact('Dra. Ejemplo', '+59167402602');

      expect(link.textContent).toContain('Contáctanos');
      expect(link.textContent).not.toMatch(/\d{4}/);
    });

    it('muestra el ícono de WhatsApp (CLI-168)', () => {
      const link = contact('Dra. Ejemplo', '+59167402602');

      expect(link.querySelector('svg.payment-qr__contact-icon')).not.toBeNull();
      expect(link.querySelector('.material-symbols-outlined')).toBeNull();
    });

    it('abre WhatsApp con el doctor elegido y un mensaje listo, sin emojis', () => {
      const href = contact('Dra. Ejemplo', '+59167402602').getAttribute('href')!;

      expect(href.startsWith('https://wa.me/59167402602?text=')).toBe(true);
      const text = decodeURIComponent(href.split('text=')[1]);
      expect(text).toContain('Dra. Ejemplo');
      // wa.me corrompe los caracteres de 3+ bytes UTF-8 (emojis).
      expect([...text].every((c) => (c.codePointAt(0) ?? 0) < 0x2000)).toBe(true);
    });

    it('sin teléfono del doctor usa el WhatsApp de la clínica', () => {
      const href = contact(null, null).getAttribute('href')!;

      expect(href.startsWith('https://wa.me/59157744250?text=')).toBe(true);
    });
  });

  it('permite descargar la imagen del QR como PNG, con un nombre claro (CLI-170)', () => {
    const { root } = setup(false);
    const link = root.querySelector<HTMLAnchorElement>('.payment-qr__download-btn')!;

    expect(link.textContent).toContain('Descargar QR');
    expect(link.getAttribute('download')).toBe('qr-pago-clinica-guizada-aliaga.png');
    // Es la misma imagen que se muestra, y Angular no la marca como insegura.
    expect(link.getAttribute('href')).toBe('data:image/png;base64,QUJD');
    expect(link.getAttribute('href')).toBe(root.querySelector('img')?.getAttribute('src'));
  });

  it('antes de pagar avisa que la clínica no realiza reembolsos (CLI-103)', () => {
    const { root } = setup(false);

    expect(root.querySelector('.payment-qr__warning')?.textContent).toContain('La clínica no realiza reembolsos');
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
    expect(root.textContent).toContain('No detectamos tu pago todavía');
    // CLI-165: se presenta como un error (alerta), no como una nota.
    expect(root.querySelector('.payment-qr__not-paid-yet')?.getAttribute('role')).toBe('alert');
    expect(root.querySelector<HTMLButtonElement>('.payment-qr__check-btn')!.disabled).toBe(false);
  });
});
