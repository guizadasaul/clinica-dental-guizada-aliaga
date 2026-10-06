import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppointmentDetailDialogComponent } from './appointment-detail-dialog';
import { AppointmentsService } from '../../services/appointments.service';
import type { AppointmentAgendaItem } from '../../models/appointment.model';

const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function appointment(overrides: Partial<AppointmentAgendaItem> = {}): AppointmentAgendaItem {
  return {
    id: 'appt-1',
    appointmentDatetime: FUTURE,
    status: 'confirmed',
    patientId: 'p-1',
    patientFirstName: 'Juana',
    patientLastNamePaternal: 'Perez',
    patientPhone: '70011122',
    patientEmail: null,
    guestFirstName: null,
    guestLastNamePaternal: null,
    guestPhone: null,
    doctorId: 'doctor-a',
    doctorName: 'Dr. Saul',
    doctorColor: null,
    durationMinutes: 60,
    source: 'doctor',
    treatmentId: 't-1',
    treatmentName: 'Control de ortodoncia',
    notes: 'traer radiografía',
    cancelledAt: null,
    ...overrides,
  };
}

function setup(appt: AppointmentAgendaItem = appointment(), cancelResult?: unknown) {
  const appointmentsService = {
    cancelByDoctor: vi.fn().mockReturnValue(cancelResult ?? of({ ...appt, status: 'cancelled' })),
    markNoShow: vi.fn().mockReturnValue(of({ ...appt, status: 'no_show' })),
    undoNoShow: vi.fn().mockReturnValue(of({ ...appt, status: 'confirmed' })),
  };
  TestBed.configureTestingModule({
    imports: [AppointmentDetailDialogComponent],
    providers: [{ provide: AppointmentsService, useValue: appointmentsService }],
  });
  const fixture = TestBed.createComponent(AppointmentDetailDialogComponent);
  fixture.componentRef.setInput('appointment', appt);
  fixture.detectChanges();
  return { fixture, appointmentsService };
}

function button(fixture: ComponentFixture<AppointmentDetailDialogComponent>, label: string) {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].find((b) => b.textContent?.includes(label));
}

describe('AppointmentDetailDialogComponent (CLI-151)', () => {
  it('muestra paciente, teléfono, tratamiento, origen y notas', () => {
    const { fixture } = setup();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Juana Perez');
    expect(text).toContain('70011122');
    expect(text).toContain('Control de ortodoncia');
    expect(text).toContain('Agendada por el doctor');
    expect(text).toContain('traer radiografía');
    expect(text).toContain('60 min');
  });

  it('una consulta web se identifica como tal', () => {
    const { fixture } = setup(
      appointment({ source: 'public_web', notes: null, treatmentName: null }),
    );

    expect(fixture.nativeElement.textContent).toContain('Consulta reservada por la web');
  });

  it('emite abrir ficha, reprogramar y cerrar', () => {
    const { fixture } = setup();
    const openRecord = vi.fn();
    const reschedule = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.openRecord.subscribe(openRecord);
    fixture.componentInstance.reschedule.subscribe(reschedule);
    fixture.componentInstance.closed.subscribe(closed);

    button(fixture, 'Abrir ficha')!.click();
    button(fixture, 'Reprogramar')!.click();
    (fixture.nativeElement.querySelector('.detail-modal') as HTMLElement).click();

    expect(openRecord).toHaveBeenCalledWith('p-1');
    expect(reschedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'appt-1' }));
    expect(closed).toHaveBeenCalled();
  });

  it('una cita pasada no se reprograma ni se cancela', () => {
    const { fixture } = setup(appointment({ appointmentDatetime: PAST }));

    expect(button(fixture, 'Abrir ficha')).toBeTruthy();
    expect(button(fixture, 'Reprogramar')).toBeFalsy();
    expect(button(fixture, 'Cancelar cita')).toBeFalsy();
  });

  it('una reserva sin ficha no ofrece abrir la ficha', () => {
    const { fixture } = setup(appointment({ patientId: null }));

    expect(button(fixture, 'Abrir ficha')).toBeFalsy();
    expect(button(fixture, 'Cancelar cita')).toBeTruthy();
  });

  it('cancelar pide confirmación, manda el motivo y emite la cita cancelada', async () => {
    const { fixture, appointmentsService } = setup();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    button(fixture, 'Cancelar cita')!.click();
    fixture.detectChanges();
    expect(appointmentsService.cancelByDoctor).not.toHaveBeenCalled();
    const reason = fixture.nativeElement.querySelector(
      '#detail-modal-reason',
    ) as HTMLTextAreaElement;
    reason.value = '  no puede venir ';
    reason.dispatchEvent(new Event('input'));
    button(fixture, 'Sí, cancelar cita')!.click();
    await fixture.whenStable();

    expect(appointmentsService.cancelByDoctor).toHaveBeenCalledWith('appt-1', 'no puede venir');
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });

  it('"Volver" deja la cita como estaba', () => {
    const { fixture, appointmentsService } = setup();

    button(fixture, 'Cancelar cita')!.click();
    fixture.detectChanges();
    button(fixture, 'Volver')!.click();
    fixture.detectChanges();

    expect(button(fixture, 'Reprogramar')).toBeTruthy();
    expect(appointmentsService.cancelByDoctor).not.toHaveBeenCalled();
  });

  it('si falla la cancelación lo dice y no emite', async () => {
    const { fixture } = setup(
      appointment(),
      throwError(() => ({ status: 500 })),
    );
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    button(fixture, 'Cancelar cita')!.click();
    fixture.detectChanges();
    button(fixture, 'Sí, cancelar cita')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancelled).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cancelar la cita');
  });

  // CLI-208
  describe('"No asistió"', () => {
    it('una cita futura no lo ofrece', () => {
      const { fixture } = setup();

      expect(button(fixture, 'No asistió')).toBeFalsy();
    });

    it('en una cita pasada confirmada lo marca y emite la cita actualizada', async () => {
      const { fixture, appointmentsService } = setup(appointment({ appointmentDatetime: PAST }));
      const changed = vi.fn();
      fixture.componentInstance.attendanceChanged.subscribe(changed);

      button(fixture, 'No asistió')!.click();
      await fixture.whenStable();

      expect(appointmentsService.markNoShow).toHaveBeenCalledWith('appt-1');
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: 'no_show' }));
    });

    it('una cita marcada lo avisa y permite deshacerlo', async () => {
      const { fixture, appointmentsService } = setup(
        appointment({ appointmentDatetime: PAST, status: 'no_show' }),
      );
      const changed = vi.fn();
      fixture.componentInstance.attendanceChanged.subscribe(changed);

      expect(fixture.nativeElement.textContent).toContain('El paciente no asistió');
      button(fixture, 'Deshacer')!.click();
      await fixture.whenStable();

      expect(appointmentsService.undoNoShow).toHaveBeenCalledWith('appt-1');
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
    });

    it('si falla lo dice y no emite', async () => {
      const { fixture, appointmentsService } = setup(appointment({ appointmentDatetime: PAST }));
      appointmentsService.markNoShow.mockReturnValue(throwError(() => ({ status: 409 })));
      const changed = vi.fn();
      fixture.componentInstance.attendanceChanged.subscribe(changed);

      button(fixture, 'No asistió')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(changed).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('No pudimos guardar el cambio');
    });
  });
});
