import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { DoctorAgendaComponent } from './doctor-agenda';
import { AppointmentsService } from '../../services/appointments.service';
import type { AppointmentAgendaItem } from '../../models/appointment.model';
import { AuthService } from '../../../../auth/application/auth.service';

// 14:00 UTC = 10:00 en La Paz (UTC-4) — dentro de la grilla (9:00–24:00) y,
// salvo que el test corra entre las 00:00 y 03:59 UTC, mismo día calendario
// que "hoy" en La Paz, así que siempre cae dentro de la semana visible.
function todayAtLaPazMorning(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0),
  ).toISOString();
}

function fakeAppointment(overrides: Partial<AppointmentAgendaItem> = {}): AppointmentAgendaItem {
  return {
    id: 'appt-1',
    appointmentDatetime: todayAtLaPazMorning(),
    status: 'confirmed',
    patientId: 'patient-1',
    patientFirstName: 'Juana',
    patientLastNamePaternal: 'Perez',
    patientPhone: '70011122',
    patientEmail: null,
    guestFullName: null,
    guestFirstName: null,
    guestLastNamePaternal: null,
    guestPhone: null,
    doctorId: 'doctor-a',
    doctorName: 'Dr. Saul',
    doctorColor: '#2563eb',
    ...overrides,
  };
}

function setup(appointments: AppointmentAgendaItem[] = [fakeAppointment()]) {
  const appointmentsService = { getAgenda: vi.fn().mockReturnValue(of(appointments)) };
  TestBed.configureTestingModule({
    imports: [DoctorAgendaComponent],
    providers: [
      { provide: AppointmentsService, useValue: appointmentsService },
      // El doctor logueado — en la agenda común solo sus turnos abren la ficha.
      { provide: AuthService, useValue: { currentUser: signal({ id: 'doctor-a' }) } },
    ],
  });
  const fixture = TestBed.createComponent(DoctorAgendaComponent);
  return { fixture, appointmentsService };
}

async function settle(fixture: ComponentFixture<DoctorAgendaComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('DoctorAgendaComponent', () => {
  it('loads its own agenda (no doctorId) by default', async () => {
    const { fixture, appointmentsService } = setup();
    await settle(fixture);

    expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', doctorId: undefined }),
    );
  });

  it('requests the given doctor agenda when doctorId is set (CLI-64, admin view)', async () => {
    const { fixture, appointmentsService } = setup();
    fixture.componentRef.setInput('doctorId', 'doctor-9');
    await settle(fixture);

    expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-9' }),
    );
  });

  it('reloads when doctorId changes without remounting the component', async () => {
    const { fixture, appointmentsService } = setup();
    await settle(fixture);
    appointmentsService.getAgenda.mockClear();

    fixture.componentRef.setInput('doctorId', 'doctor-9');
    await settle(fixture);

    expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-9' }),
    );
  });

  it('opens the patient history from a slot when not read-only', async () => {
    const { fixture } = setup();
    await settle(fixture);

    const slot = fixture.nativeElement.querySelector('.agenda-slot') as HTMLButtonElement;
    expect(slot).toBeTruthy();
    slot.click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-patient-wizard')).toBeTruthy();
  });

  it('does not open the patient history from a slot when readOnly is true', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('readOnly', true);
    await settle(fixture);

    const slot = fixture.nativeElement.querySelector('.agenda-slot') as HTMLButtonElement;
    expect(slot).toBeTruthy();
    slot.click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-patient-wizard')).toBeFalsy();
  });

  it('shows a generic "Agenda" title in read-only mode instead of "Mi agenda"', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('readOnly', true);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.agenda__title')?.textContent).toContain('Agenda');
    expect(fixture.nativeElement.querySelector('.agenda__title')?.textContent).not.toContain('Mi agenda');
  });

  describe('agenda común (CLI-110)', () => {
    function scopeButton(fixture: ComponentFixture<DoctorAgendaComponent>, label: string): HTMLButtonElement {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.agenda__scope-btn')]
        .find((b) => b.textContent?.includes(label))!;
    }

    it('el toggle "Agenda común" pide la agenda con scope=all', async () => {
      const { fixture, appointmentsService } = setup();
      await settle(fixture);
      appointmentsService.getAgenda.mockClear();

      scopeButton(fixture, 'Agenda común').click();
      await settle(fixture);

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all' }));
      expect(fixture.nativeElement.querySelector('.agenda__title')?.textContent).toContain('Agenda común');
    });

    it('pinta cada turno con el color de su doctor y muestra la leyenda', async () => {
      const { fixture } = setup([
        fakeAppointment({ id: 'a-1' }),
        fakeAppointment({ id: 'a-2', doctorId: 'doctor-b', doctorName: 'Dra. Marylu', doctorColor: '#db2777' }),
      ]);
      await settle(fixture);
      scopeButton(fixture, 'Agenda común').click();
      await settle(fixture);

      const slots = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.agenda-slot')];
      expect(slots.map((s) => s.style.getPropertyValue('--slot-color'))).toEqual(['#2563eb', '#db2777']);
      const legend = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.agenda__legend-item')]
        .map((i) => i.textContent?.trim());
      expect(legend).toEqual(['Dr. Saul', 'Dra. Marylu']);
    });

    it('dos turnos a la misma hora van en carriles distintos, lado a lado', async () => {
      const { fixture } = setup([
        fakeAppointment({ id: 'a-1' }),
        fakeAppointment({ id: 'a-2', doctorId: 'doctor-b', doctorColor: '#db2777' }),
      ]);
      await settle(fixture);

      const [first, second] = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.agenda-slot')];
      expect(first.style.left).not.toBe(second.style.left);
      expect(first.style.width).toContain('0.5');
    });

    it('un turno de otro doctor en la agenda común no abre la ficha', async () => {
      const { fixture } = setup([fakeAppointment({ doctorId: 'doctor-b' })]);
      await settle(fixture);
      scopeButton(fixture, 'Agenda común').click();
      await settle(fixture);

      (fixture.nativeElement.querySelector('.agenda-slot') as HTMLButtonElement).click();
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('app-patient-wizard')).toBeFalsy();
    });

    it('con allDoctors (panel de admin) usa la agenda común sin mostrar el toggle', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.componentRef.setInput('readOnly', true);
      fixture.componentRef.setInput('allDoctors', true);
      await settle(fixture);

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all' }));
      expect(fixture.nativeElement.querySelector('.agenda__scope')).toBeFalsy();
    });
  });
});
