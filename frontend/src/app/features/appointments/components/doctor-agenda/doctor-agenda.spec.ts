import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { DoctorAgendaComponent } from './doctor-agenda';
import { AppointmentsService } from '../../services/appointments.service';
import type { AppointmentAgendaItem, DoctorScheduleBlock } from '../../models/appointment.model';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';

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
    guestFirstName: null,
    guestLastNamePaternal: null,
    guestPhone: null,
    doctorId: 'doctor-a',
    doctorName: 'Dr. Saul',
    doctorColor: '#2563eb',
    durationMinutes: 30,
    source: 'public_web',
    treatmentId: null,
    treatmentName: null,
    notes: null,
    cancelledAt: null,
    ...overrides,
  };
}

function setup(
  appointments: AppointmentAgendaItem[] = [fakeAppointment()],
  schedule: DoctorScheduleBlock[] = [],
) {
  const appointmentsService = {
    getAgenda: vi.fn().mockReturnValue(of(appointments)),
    getMySchedule: vi.fn().mockReturnValue(of(schedule)),
    createByDoctor: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [DoctorAgendaComponent],
    providers: [
      { provide: AppointmentsService, useValue: appointmentsService },
      // El modal de "Agendar cita" (CLI-150) carga pacientes y tratamientos.
      { provide: PatientsService, useValue: { getAll: () => of([]) } },
      { provide: TreatmentsService, useValue: { getAll: () => of([]) } },
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

    expect(fixture.nativeElement.querySelector('.page-header__title')?.textContent).toContain(
      'Agenda',
    );
    expect(fixture.nativeElement.querySelector('.page-header__title')?.textContent).not.toContain(
      'Mi agenda',
    );
  });

  describe('agenda común (CLI-110)', () => {
    function scopeButton(
      fixture: ComponentFixture<DoctorAgendaComponent>,
      label: string,
    ): HTMLButtonElement {
      return [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.agenda__scope-btn',
        ),
      ].find((b) => b.textContent?.includes(label))!;
    }

    it('el toggle "Agenda común" pide la agenda con scope=all', async () => {
      const { fixture, appointmentsService } = setup();
      await settle(fixture);
      appointmentsService.getAgenda.mockClear();

      scopeButton(fixture, 'Agenda común').click();
      await settle(fixture);

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'all' }),
      );
      expect(fixture.nativeElement.querySelector('.page-header__title')?.textContent).toContain(
        'Agenda común',
      );
    });

    it('pinta cada turno con el color de su doctor y muestra la leyenda', async () => {
      const { fixture } = setup([
        fakeAppointment({ id: 'a-1' }),
        fakeAppointment({
          id: 'a-2',
          doctorId: 'doctor-b',
          doctorName: 'Dra. Marylu',
          doctorColor: '#db2777',
        }),
      ]);
      await settle(fixture);
      scopeButton(fixture, 'Agenda común').click();
      await settle(fixture);

      const slots = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.agenda-slot'),
      ];
      expect(slots.map((s) => s.style.getPropertyValue('--slot-color'))).toEqual([
        '#2563eb',
        '#db2777',
      ]);
      const legend = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll('.agenda__legend-item'),
      ].map((i) => i.textContent?.trim());
      expect(legend).toEqual(['Dr. Saul', 'Dra. Marylu']);
    });

    it('dos turnos a la misma hora van en carriles distintos, lado a lado', async () => {
      const { fixture } = setup([
        fakeAppointment({ id: 'a-1' }),
        fakeAppointment({ id: 'a-2', doctorId: 'doctor-b', doctorColor: '#db2777' }),
      ]);
      await settle(fixture);

      const [first, second] = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.agenda-slot'),
      ];
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

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'all' }),
      );
      expect(fixture.nativeElement.querySelector('.agenda__scope')).toBeFalsy();
    });
  });

  // CLI-150: agendar haciendo click sobre un horario de "Mi agenda".
  describe('agendar desde la grilla', () => {
    type Internals = {
      visibleDates: () => string[];
      cellsFor: (date: string) => { minutes: number; bookable: boolean; offHours: boolean }[];
      bookingSlot: () => { date: string; minutes: number } | null;
      notice: () => string | null;
      onBooked: (created: AppointmentAgendaItem) => void;
    };
    const internals = (fixture: ComponentFixture<DoctorAgendaComponent>) =>
      fixture.componentInstance as unknown as Internals;

    // La semana siguiente siempre es futura entera — no depende de la hora en que corre el test.
    async function nextWeek(fixture: ComponentFixture<DoctorAgendaComponent>): Promise<void> {
      (
        fixture.nativeElement.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement
      ).click();
      await settle(fixture);
    }

    const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-04:00`).toISOString();

    it('click en una franja libre abre el modal con ese día y esa hora', async () => {
      const { fixture } = setup([]);
      await settle(fixture);
      await nextWeek(fixture);

      const cell = fixture.nativeElement.querySelector('button.agenda-cell') as HTMLButtonElement;
      expect(cell.getAttribute('aria-label')).toContain('a las 09:00');
      cell.click();
      await settle(fixture);

      expect(internals(fixture).bookingSlot()).toEqual({
        date: internals(fixture).visibleDates()[0],
        minutes: 9 * 60,
      });
      expect(fixture.nativeElement.querySelector('app-book-appointment-dialog')).toBeTruthy();
    });

    it('las franjas ocupadas por una cita (según su duración) no se pueden agendar', async () => {
      const { fixture, appointmentsService } = setup([]);
      await settle(fixture);
      const monday = internals(fixture).visibleDates()[0];
      const nextMonday = new Date(Date.parse(`${monday}T12:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      appointmentsService.getAgenda.mockReturnValue(
        of([
          fakeAppointment({ appointmentDatetime: at(nextMonday, '10:00'), durationMinutes: 60 }),
        ]),
      );
      await nextWeek(fixture);

      const cells = internals(fixture).cellsFor(nextMonday);
      const byMinutes = (m: number) => cells.find((c) => c.minutes === m)!;
      expect(byMinutes(9 * 60 + 30).bookable).toBe(true);
      expect(byMinutes(10 * 60).bookable).toBe(false);
      expect(byMinutes(10 * 60 + 30).bookable).toBe(false);
      expect(byMinutes(11 * 60).bookable).toBe(true);
    });

    it('dibuja cada turno con el alto de su duración', async () => {
      const { fixture } = setup([fakeAppointment({ durationMinutes: 90 })]);
      await settle(fixture);

      const slot = fixture.nativeElement.querySelector('.agenda-slot') as HTMLElement;
      expect(slot.style.height).toBe('120px');
    });

    it('en semanas pasadas no hay franjas para agendar', async () => {
      const { fixture } = setup([]);
      await settle(fixture);
      (
        fixture.nativeElement.querySelector('[aria-label="Página anterior"]') as HTMLButtonElement
      ).click();
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('button.agenda-cell')).toBeFalsy();
    });

    it('sombrea lo que queda fuera del horario de atención', async () => {
      const { fixture, appointmentsService } = setup(
        [],
        [{ weekday: 1, start: '09:00', end: '12:00' }],
      );
      await settle(fixture);
      await nextWeek(fixture);

      expect(appointmentsService.getMySchedule).toHaveBeenCalled();
      const cells = internals(fixture).cellsFor(internals(fixture).visibleDates()[0]);
      expect(cells.find((c) => c.minutes === 9 * 60)!.offHours).toBe(false);
      expect(cells.find((c) => c.minutes === 15 * 60)!.offHours).toBe(true);
    });

    it('no se agenda en la agenda común', async () => {
      const { fixture } = setup([]);
      await settle(fixture);
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.agenda__scope-btn',
        ),
      ]
        .find((b) => b.textContent?.includes('Agenda común'))!
        .click();
      await settle(fixture);
      await nextWeek(fixture);

      expect(fixture.nativeElement.querySelector('button.agenda-cell')).toBeFalsy();
    });

    it('no se agenda en la vista de solo lectura del admin', async () => {
      const { fixture, appointmentsService } = setup([]);
      fixture.componentRef.setInput('readOnly', true);
      fixture.componentRef.setInput('doctorId', 'doctor-9');
      await settle(fixture);
      await nextWeek(fixture);

      expect(fixture.nativeElement.querySelector('button.agenda-cell')).toBeFalsy();
      expect(appointmentsService.getMySchedule).not.toHaveBeenCalled();
    });

    it('al agendar cierra el modal, avisa y recarga la semana', async () => {
      const { fixture, appointmentsService } = setup([]);
      await settle(fixture);
      await nextWeek(fixture);
      (fixture.nativeElement.querySelector('button.agenda-cell') as HTMLButtonElement).click();
      await settle(fixture);
      const loads = appointmentsService.getAgenda.mock.calls.length;

      internals(fixture).onBooked(fakeAppointment({ source: 'doctor' }));
      await settle(fixture);

      expect(internals(fixture).bookingSlot()).toBeNull();
      expect(internals(fixture).notice()).toContain('Cita agendada: Juana Perez');
      expect(appointmentsService.getAgenda.mock.calls.length).toBe(loads + 1);
    });
  });
});
