import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PatientInvitePanelComponent } from './patient-invite-panel';
import { PatientsService } from '../../services/patients.service';
import { PatientInvitesService } from '../../../patient-invites/services/patient-invites.service';

function setup(initial: { phone?: string | null; email?: string | null } = {}) {
  const patients = { updatePatient: vi.fn().mockReturnValue(of({ id: 'patient-1' })) };
  const invites = { createInvite: vi.fn().mockReturnValue(of({ whatsappUrl: null })) };
  TestBed.configureTestingModule({
    imports: [PatientInvitePanelComponent],
    providers: [
      { provide: PatientsService, useValue: patients },
      { provide: PatientInvitesService, useValue: invites },
    ],
  });
  const fixture = TestBed.createComponent(PatientInvitePanelComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  fixture.componentRef.setInput('initialFirstName', 'Ana');
  fixture.componentRef.setInput('initialLastNamePaternal', 'Pérez');
  fixture.componentRef.setInput(
    'initialPhone',
    initial.phone === undefined ? '+59170000000' : initial.phone,
  );
  fixture.componentRef.setInput(
    'initialEmail',
    initial.email === undefined ? 'ana@example.com' : initial.email,
  );
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const emitted = { sent: [] as string[], cancelled: 0 };
  fixture.componentInstance.sent.subscribe((c) => emitted.sent.push(c));
  fixture.componentInstance.cancelled.subscribe(() => emitted.cancelled++);
  return { fixture, root, patients, invites, emitted };
}

function input(root: HTMLElement, id: string): HTMLInputElement {
  return root.querySelector<HTMLInputElement>(`#${id}`)!;
}

function type(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes(label),
  )!;
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PatientInvitePanelComponent', () => {
  it('precarga los datos de contacto, cada campo con su etiqueta', () => {
    const { root } = setup();

    expect(input(root, 'invitePanelFirstName').value).toBe('Ana');
    expect(input(root, 'invitePanelPhone').value).toBe('+59170000000');
    expect(root.querySelector('label[for="invitePanelEmail"]')).not.toBeNull();
  });

  it('con los datos guardados se puede enviar por los dos canales', () => {
    const { root } = setup();

    expect(button(root, 'Enviar por email').disabled).toBe(false);
    expect(button(root, 'Enviar por WhatsApp').disabled).toBe(false);
  });

  it('sin email o sin teléfono cargado, ese canal queda deshabilitado con el motivo', () => {
    const { root } = setup({ phone: null, email: null });

    expect(button(root, 'Enviar por email').disabled).toBe(true);
    expect(button(root, 'Enviar por email').title).toContain('email');
    expect(button(root, 'Enviar por WhatsApp').title).toContain('teléfono');
  });

  it('con cambios sin guardar pide guardar antes de enviar', () => {
    const { fixture, root } = setup();

    type(input(root, 'invitePanelEmail'), 'otro@example.com');
    fixture.detectChanges();

    expect(root.textContent).toContain('Guardá los cambios antes de enviar');
    expect(button(root, 'Enviar por email').disabled).toBe(true);
  });

  describe('guardar', () => {
    it('manda los datos recortados y deja de estar "sucio"', async () => {
      const { fixture, root, patients } = setup();
      type(input(root, 'invitePanelFirstName'), '  Ana María ');
      type(input(root, 'invitePanelEmail'), ' nueva@example.com ');
      fixture.detectChanges();

      button(root, 'Guardar').click();
      await settle(fixture);

      expect(patients.updatePatient).toHaveBeenCalledWith('patient-1', {
        firstName: 'Ana María',
        lastNamePaternal: 'Pérez',
        phone: '+59170000000',
        email: 'nueva@example.com',
      });
      expect(root.textContent).not.toContain('Guardá los cambios');
    });

    it('un teléfono o email vacío se guarda como "sin dato"', async () => {
      const { fixture, root, patients } = setup();
      type(input(root, 'invitePanelPhone'), '   ');
      fixture.detectChanges();

      button(root, 'Guardar').click();
      await settle(fixture);

      expect(patients.updatePatient).toHaveBeenCalledWith(
        'patient-1',
        expect.objectContaining({ phone: undefined }),
      );
      expect(button(root, 'Enviar por WhatsApp').disabled).toBe(true);
    });

    it('exige nombre y apellido paterno', async () => {
      const { fixture, root, patients } = setup();
      type(input(root, 'invitePanelLastNamePaternal'), ' ');
      fixture.detectChanges();

      button(root, 'Guardar').click();
      await settle(fixture);

      expect(patients.updatePatient).not.toHaveBeenCalled();
      expect(root.textContent).toContain('Nombre y apellido paterno son obligatorios');
    });

    it('si falla, avisa y sigue pudiendo reintentar', async () => {
      const { fixture, root, patients } = setup();
      patients.updatePatient.mockReturnValue(throwError(() => new Error('500')));

      button(root, 'Guardar').click();
      await settle(fixture);

      expect(root.textContent).toContain('No pudimos guardar los cambios');
      expect(button(root, 'Guardar').disabled).toBe(false);
    });
  });

  describe('enviar', () => {
    it('por email avisa al panel que se envió', async () => {
      const { fixture, root, invites, emitted } = setup();

      button(root, 'Enviar por email').click();
      await settle(fixture);

      expect(invites.createInvite).toHaveBeenCalledWith('patient-1', 'email');
      expect(emitted.sent).toEqual(['email']);
    });

    it('por WhatsApp abre el link del mensaje en otra pestaña', async () => {
      const { fixture, root, invites, emitted } = setup();
      invites.createInvite.mockReturnValue(
        of({ whatsappUrl: 'https://wa.me/59170000000?text=hola' }),
      );
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      button(root, 'Enviar por WhatsApp').click();
      await settle(fixture);

      expect(open).toHaveBeenCalledWith('https://wa.me/59170000000?text=hola', '_blank');
      expect(emitted.sent).toEqual(['whatsapp']);
      open.mockRestore();
    });

    it('por WhatsApp sin link no abre nada pero igual cierra el flujo', async () => {
      const { fixture, root, emitted } = setup();
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      button(root, 'Enviar por WhatsApp').click();
      await settle(fixture);

      expect(open).not.toHaveBeenCalled();
      expect(emitted.sent).toEqual(['whatsapp']);
      open.mockRestore();
    });

    it.each([
      ['Enviar por email', 'No pudimos enviar el email'],
      ['Enviar por WhatsApp', 'No pudimos armar el mensaje de WhatsApp'],
    ])('si "%s" falla, muestra el error y no cierra', async (label, message) => {
      const { fixture, root, invites, emitted } = setup();
      invites.createInvite.mockReturnValue(throwError(() => new Error('500')));

      button(root, label).click();
      await settle(fixture);

      expect(root.textContent).toContain(message);
      expect(emitted.sent).toEqual([]);
    });
  });

  it('"Cerrar" cancela el envío', () => {
    const { root, emitted } = setup();

    button(root, 'Cerrar').click();

    expect(emitted.cancelled).toBe(1);
  });
});
