import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminDoctorInvitePanelComponent } from './admin-doctor-invite-panel';
import { AdminDoctorsService } from '../../services/admin-doctors.service';
import type { AdminDoctorSummary } from '../../models/admin-doctor.model';

const DOCTOR: AdminDoctorSummary = {
  id: 'doctor-1',
  displayName: 'Dra. Marylu Aliaga',
  firstName: 'Marylu',
  lastNamePaternal: 'Aliaga',
  lastNameMaternal: null,
  registrationStatus: 'pending',
  email: 'marylu@example.com',
  phone: '+59170011122',
  specialty: null,
  photoUrl: null,
  displayOrder: 0,
  isBookable: false,
  isActive: true,
};

function setup(doctor: AdminDoctorSummary = DOCTOR) {
  const adminDoctorsService = { createInvite: vi.fn().mockReturnValue(of({})) };
  TestBed.configureTestingModule({
    imports: [AdminDoctorInvitePanelComponent],
    providers: [{ provide: AdminDoctorsService, useValue: adminDoctorsService }],
  });
  const fixture = TestBed.createComponent(AdminDoctorInvitePanelComponent);
  fixture.componentRef.setInput('doctor', doctor);
  const sent = vi.fn();
  const editRequested = vi.fn();
  const closed = vi.fn();
  fixture.componentInstance.sent.subscribe(sent);
  fixture.componentInstance.editRequested.subscribe(editRequested);
  fixture.componentInstance.closed.subscribe(closed);
  return { fixture, adminDoctorsService, sent, editRequested, closed };
}

function el<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminDoctorInvitePanelComponent', () => {
  it('shows the public name and both contact data of the doctor', async () => {
    const { fixture } = setup();
    await settle(fixture);

    expect(el(fixture, '.invite-panel__intro')?.textContent).toContain('Dra. Marylu Aliaga');
    expect(el(fixture, '.invite-panel__contact-email')?.textContent).toContain('marylu@example.com');
    expect(el(fixture, '.invite-panel__contact-phone')?.textContent).toContain('+59170011122');
  });

  it('enables both channels when the doctor has an email and a phone, with no "edit contact" hint', async () => {
    const { fixture } = setup();
    await settle(fixture);

    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').disabled).toBe(false);
    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--whatsapp').disabled).toBe(false);
    expect(el(fixture, '.invite-panel__link')).toBeFalsy();
  });

  it('disables the email channel when the doctor has no email and points to "Editar datos de contacto"', async () => {
    const { fixture, editRequested } = setup({ ...DOCTOR, email: null });
    await settle(fixture);

    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').disabled).toBe(true);
    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--whatsapp').disabled).toBe(false);
    expect(el(fixture, '.invite-panel__contact-email')?.textContent).toContain('No cargado');

    el<HTMLButtonElement>(fixture, '.invite-panel__link').click();
    expect(editRequested).toHaveBeenCalled();
  });

  it('disables the WhatsApp channel when the doctor has no phone', async () => {
    const { fixture } = setup({ ...DOCTOR, phone: null });
    await settle(fixture);

    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--whatsapp').disabled).toBe(true);
    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').disabled).toBe(false);
  });

  it('sends the invitation by email and reports the channel', async () => {
    const { fixture, adminDoctorsService, sent } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').click();
    await settle(fixture);

    expect(adminDoctorsService.createInvite).toHaveBeenCalledWith('doctor-1', 'email');
    expect(sent).toHaveBeenCalledWith('email');
  });

  it('opens the wa.me link in a new tab for WhatsApp and reports the channel', async () => {
    const { fixture, adminDoctorsService, sent } = setup();
    adminDoctorsService.createInvite.mockReturnValue(of({ whatsappUrl: 'https://wa.me/59170011122?text=hola' }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.invite-panel__btn--whatsapp').click();
    await settle(fixture);

    expect(adminDoctorsService.createInvite).toHaveBeenCalledWith('doctor-1', 'whatsapp');
    expect(open).toHaveBeenCalledWith('https://wa.me/59170011122?text=hola', '_blank');
    expect(sent).toHaveBeenCalledWith('whatsapp');
    open.mockRestore();
  });

  it('shows the backend message on a 409 (e.g. the doctor already registered) and does not report a send', async () => {
    const { fixture, adminDoctorsService, sent } = setup();
    adminDoctorsService.createInvite.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'El doctor ya se registró' } })),
    );
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').click();
    await settle(fixture);

    expect(el(fixture, '.invite-panel__error')?.textContent).toContain('El doctor ya se registró');
    expect(sent).not.toHaveBeenCalled();
  });

  it('shows a channel-specific message on any other error, so the admin can retry', async () => {
    const { fixture, adminDoctorsService, sent } = setup();
    adminDoctorsService.createInvite.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').click();
    await settle(fixture);

    expect(el(fixture, '.invite-panel__error')?.textContent).toContain('No pudimos enviar el email');
    expect(el<HTMLButtonElement>(fixture, '.invite-panel__btn--email').disabled).toBe(false);
    expect(sent).not.toHaveBeenCalled();
  });

  it('emits closed when the admin closes the panel without sending', async () => {
    const { fixture, closed, adminDoctorsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.invite-panel__header .invite-panel__btn').click();

    expect(closed).toHaveBeenCalled();
    expect(adminDoctorsService.createInvite).not.toHaveBeenCalled();
  });
});
