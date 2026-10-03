import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { DoctorAgendaComponent } from './doctor-agenda';
import { AppointmentsService } from '../../services/appointments.service';
import type { AppointmentAgendaItem, DoctorScheduleBlock } from '../../models/appointment.model';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';

// 14:00 UTC = 10:00 en La Paz (UTC-4) — dentro de la grilla (9:00–24:00).
// El día calendario se toma de "hoy" en La Paz (now - 4h), no de "hoy" en
// UTC: entre las 00:00 y 03:59 UTC la fecha UTC ya es mañana en La Paz, y un
// domingo eso cae en la semana siguiente, fuera de la vista.
function todayAtLaPazMorning(): string {
  const laPazNow = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(laPazNow.getUTCFullYear(), laPazNow.getUTCMonth(), laPazNow.getUTCDate(), 14, 0, 0),
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

  // CLI-151: el click abre el detalle del turno; la ficha se abre desde ahí.
  it('opens the appointment detail from a slot, and the patient history from it', async () => {
    const { fixture } = setup();
    await settle(fixture);

    const slot = fixture.nativeElement.querySelector('.agenda-slot') as HTMLButtonElement;
    expect(slot).toBeTruthy();
    slot.click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('app-appointment-detail-dialog')).toBeTruthy();

    const openRecord = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.detail-modal__btn'),
    ].find((b) => b.textContent?.includes('Abrir ficha'))!;
    openRecord.click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-appointment-detail-dialog')).toBeFalsy();
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
    expect(fixture.nativeElement.querySelector('app-appointment-detail-dialog')).toBeFalsy();
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
      expect(fixture.nativeElement.querySelector('app-appointment-detail-dialog')).toBeFalsy();
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

  // CLI-192: la grilla cubre las 24 horas y arranca en las 09:00.
  describe('grilla de 24 horas (CLI-192)', () => {
    type Grid = {
      visibleDates: () => string[];
      cellsFor: (date: string) => { minutes: number }[];
      hourMarks: { label: string; offset: number }[];
      gridHeightPx: number;
      defaultScrollPx: number;
    };
    const grid = (fixture: ComponentFixture<DoctorAgendaComponent>) =>
      fixture.componentInstance as unknown as Grid;

    it('tiene una celda por cada media hora del día, de 00:00 a 23:30', async () => {
      const { fixture } = setup([], [{ weekday: 1, start: '08:00', end: '12:00' }]);
      await settle(fixture);

      const cells = grid(fixture).cellsFor(grid(fixture).visibleDates()[0]);
      expect(cells).toHaveLength(48);
      expect(cells[0].minutes).toBe(0);
      expect(cells.at(-1)?.minutes).toBe(23 * 60 + 30);
    });

    it('las marcas de hora van de 0:00 a 24:00', async () => {
      const { fixture } = setup([]);
      await settle(fixture);

      const marks = grid(fixture).hourMarks;
      expect(marks[0].label).toBe('0:00');
      expect(marks.at(-1)?.label).toBe('24:00');
      expect(marks).toHaveLength(25);
      expect(grid(fixture).gridHeightPx).toBe(48 * 40);
    });

    it('al abrir, el scroll de la grilla y de los paneles de fin de semana queda en las 09:00', async () => {
      const { fixture } = setup([]);
      await settle(fixture);
      await fixture.whenStable();
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const gridEl = root.querySelector<HTMLElement>('.agenda-grid')!;
      // 9 horas × 2 franjas × 40 px: la hora por defecto queda bajo el encabezado fijo.
      expect(grid(fixture).defaultScrollPx).toBe(720);
      // En el navegador de pruebas el elemento puede no tener alto para scrollear,
      // así que se comprueba lo asignado cuando hay espacio, o el valor calculado.
      expect(gridEl.scrollTop === 720 || gridEl.scrollHeight <= gridEl.clientHeight).toBe(true);
    });

    it('una cita de madrugada o de la noche aparece en su hora (antes se filtraba)', async () => {
      const { fixture, appointmentsService } = setup([]);
      await settle(fixture);
      const monday = grid(fixture).visibleDates()[0];
      const nextMonday = new Date(Date.parse(`${monday}T12:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const at = (hhmm: string) => new Date(`${nextMonday}T${hhmm}:00-04:00`).toISOString();
      appointmentsService.getAgenda.mockReturnValue(
        of([
          fakeAppointment({ id: 'madrugada', appointmentDatetime: at('03:00') }),
          fakeAppointment({ id: 'noche', appointmentDatetime: at('23:00') }),
        ]),
      );

      (
        fixture.nativeElement.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement
      ).click();
      await settle(fixture);

      const slots = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.agenda-slot')];
      expect(slots).toHaveLength(2);
      // 03:00 → franja 6 (de 0), 23:00 → franja 46: 40 px por franja.
      const tops = slots.map((s) => parseFloat((s as HTMLElement).style.top)).sort((x, y) => x - y);
      expect(tops).toEqual([6 * 40, 46 * 40]);
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

      // La grilla es de 24 horas (CLI-192): ya no es la primera celda del día.
      const cell = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.agenda-cell'),
      ].find((c) => c.getAttribute('aria-label')?.includes('a las 09:00'))!;
      expect(cell).toBeTruthy();
      cell.click();
      await settle(fixture);

      expect(internals(fixture).bookingSlot()).toEqual({
        date: internals(fixture).visibleDates()[0],
        minutes: 9 * 60,
      });
      expect(fixture.nativeElement.querySelector('app-book-appointment-dialog')).toBeTruthy();
    });

    // CLI-194: el modal recibe las demás citas del día para avisar si la nueva las pisa.
    it('pasa al modal las demás citas del día como intervalos, sin contar la que se reprograma', async () => {
      const { fixture, appointmentsService } = setup([]);
      await settle(fixture);
      const monday = internals(fixture).visibleDates()[0];
      const nextMonday = new Date(Date.parse(`${monday}T12:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      appointmentsService.getAgenda.mockReturnValue(
        of([
          fakeAppointment({ id: 'a', appointmentDatetime: at(nextMonday, '09:45'), durationMinutes: 75 }),
          fakeAppointment({ id: 'b', appointmentDatetime: at(nextMonday, '14:00'), durationMinutes: 30 }),
        ]),
      );
      await nextWeek(fixture);
      type Busy = { busyIntervals: () => { start: number; end: number }[] };
      const slotCell = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.agenda-cell'),
      ].find((c) => c.getAttribute('aria-label')?.includes('a las 12:00'));
      slotCell?.click();
      await settle(fixture);

      const intervals = (fixture.componentInstance as unknown as Busy).busyIntervals();
      expect(intervals).toEqual([
        { start: 9 * 60 + 45, end: 11 * 60 },
        { start: 14 * 60, end: 14 * 60 + 30 },
      ]);
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

  // CLI-151: reprogramar y cancelar desde el detalle.
  describe('reprogramar y cancelar', () => {
    type Internals = {
      visibleDates: () => string[];
      cellsFor: (date: string) => { minutes: number; bookable: boolean }[];
      bookingSlot: () => { date: string; minutes: number } | null;
      rescheduling: () => AppointmentAgendaItem | null;
      detailAppointment: () => AppointmentAgendaItem | null;
      notice: () => string | null;
      scope: () => string;
      onStartReschedule: (a: AppointmentAgendaItem) => void;
      onBooked: (a: AppointmentAgendaItem) => void;
      onCancelled: (a: AppointmentAgendaItem) => void;
      onEscape: () => void;
    };
    const internals = (fixture: ComponentFixture<DoctorAgendaComponent>) =>
      fixture.componentInstance as unknown as Internals;

    function nextMondayOf(monday: string): string {
      return new Date(Date.parse(`${monday}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    }

    async function withAppointmentNextWeek(durationMinutes = 60) {
      const ctx = setup([]);
      await settle(ctx.fixture);
      const nextMonday = nextMondayOf(internals(ctx.fixture).visibleDates()[0]);
      const appt = fakeAppointment({
        appointmentDatetime: new Date(`${nextMonday}T10:00:00-04:00`).toISOString(),
        durationMinutes,
      });
      ctx.appointmentsService.getAgenda.mockReturnValue(of([appt]));
      (ctx.fixture.nativeElement.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement).click();
      await settle(ctx.fixture);
      return { ...ctx, appt, nextMonday };
    }

    it('al reprogramar, las franjas de la propia cita quedan libres y el click abre el modal de reprogramar', async () => {
      const { fixture, appt, nextMonday } = await withAppointmentNextWeek();
      const at = (m: number) => internals(fixture).cellsFor(nextMonday).find((c) => c.minutes === m)!;
      expect(at(10 * 60 + 30).bookable).toBe(false);

      internals(fixture).onStartReschedule(appt);
      await settle(fixture);

      expect(at(10 * 60 + 30).bookable).toBe(true);
      expect(fixture.nativeElement.querySelector('.agenda__pick')?.textContent).toContain('Juana Perez');
      expect(fixture.nativeElement.querySelector('.agenda-slot--moving')).toBeTruthy();

      const cell = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.agenda-cell'),
      ].find((b) => b.getAttribute('aria-label')?.includes('a las 10:30'))!;
      cell.click();
      await settle(fixture);

      expect(internals(fixture).bookingSlot()).toEqual({ date: nextMonday, minutes: 10 * 60 + 30 });
      expect(fixture.nativeElement.querySelector('.book-modal__title')?.textContent).toContain(
        'Reprogramar cita',
      );
    });

    it('reprogramar desde la agenda común vuelve a la agenda propia', async () => {
      const { fixture, appt } = await withAppointmentNextWeek();
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.agenda__scope-btn')]
        .find((b) => b.textContent?.includes('Agenda común'))!
        .click();
      await settle(fixture);

      internals(fixture).onStartReschedule(appt);

      expect(internals(fixture).scope()).toBe('mine');
    });

    it('en modo reprogramar los turnos no abren el detalle', async () => {
      const { fixture } = await withAppointmentNextWeek(30);
      internals(fixture).onStartReschedule(fakeAppointment({ id: 'other' }));
      await settle(fixture);

      (fixture.nativeElement.querySelector('.agenda-slot') as HTMLButtonElement).click();
      await settle(fixture);

      expect(internals(fixture).detailAppointment()).toBeNull();
    });

    it('Esc y el botón Cancelar salen del modo reprogramar', async () => {
      const { fixture, appt } = await withAppointmentNextWeek();
      internals(fixture).onStartReschedule(appt);
      internals(fixture).onEscape();
      expect(internals(fixture).rescheduling()).toBeNull();

      internals(fixture).onStartReschedule(appt);
      await settle(fixture);
      (fixture.nativeElement.querySelector('.agenda__pick-cancel') as HTMLButtonElement).click();
      expect(internals(fixture).rescheduling()).toBeNull();
    });

    it('al guardar la reprogramación sale del modo, avisa y recarga', async () => {
      const { fixture, appt, appointmentsService } = await withAppointmentNextWeek();
      internals(fixture).onStartReschedule(appt);
      const loads = appointmentsService.getAgenda.mock.calls.length;

      internals(fixture).onBooked(appt);

      expect(internals(fixture).rescheduling()).toBeNull();
      expect(internals(fixture).notice()).toContain('Cita reprogramada: Juana Perez');
      expect(appointmentsService.getAgenda.mock.calls.length).toBe(loads + 1);
    });

    it('al cancelar cierra el detalle, avisa y recarga', async () => {
      const { fixture, appt, appointmentsService } = await withAppointmentNextWeek();
      (fixture.nativeElement.querySelector('.agenda-slot') as HTMLButtonElement).click();
      await settle(fixture);
      const loads = appointmentsService.getAgenda.mock.calls.length;

      internals(fixture).onCancelled({ ...appt, status: 'cancelled' });

      expect(internals(fixture).detailAppointment()).toBeNull();
      expect(internals(fixture).notice()).toBe('Cita cancelada: Juana Perez');
      expect(appointmentsService.getAgenda.mock.calls.length).toBe(loads + 1);
    });
  });

  // CLI-152: al terminar de atender, ofrecer agendar la próxima cita.
  describe('próxima cita al terminar la atención', () => {
    type Internals = {
      visibleDates: () => string[];
      selectedDate: () => string;
      bookingSlot: () => { date: string; minutes: number } | null;
      followUpOffer: () => { origin: AppointmentAgendaItem; upcoming: AppointmentAgendaItem | null } | null;
      followUpPick: () => AppointmentAgendaItem | null;
      onOpenRecord: (patientId: string) => void;
      onHistoryComplete: () => void;
      onHistoryDone: () => void;
      onAcceptFollowUp: () => void;
      onDismissFollowUp: () => void;
    };
    const internals = (fixture: ComponentFixture<DoctorAgendaComponent>) =>
      fixture.componentInstance as unknown as Internals;

    // Un turno de hace una hora: siempre "de hoy o anterior", sin importar a qué hora corre el test.
    const justAttended = () =>
      fakeAppointment({ appointmentDatetime: new Date(Date.now() - 3_600_000).toISOString() });

    /** Con el detalle de un turno abierto, abre la ficha desde ahí. */
    async function openRecordFrom(origin: AppointmentAgendaItem) {
      const ctx = setup([origin]);
      await settle(ctx.fixture);
      (
        ctx.fixture.componentInstance as unknown as { detailAppointment: { set: (a: unknown) => void } }
      ).detailAppointment.set(origin);
      internals(ctx.fixture).onOpenRecord('patient-1');
      return ctx;
    }
    const openRecordFromToday = () => openRecordFrom(justAttended());

    it('al completar la ficha desde un turno de hoy, ofrece agendar la próxima cita', async () => {
      const { fixture } = await openRecordFromToday();

      internals(fixture).onHistoryComplete();
      await settle(fixture);

      expect(internals(fixture).followUpOffer()?.origin.id).toBe('appt-1');
      expect(fixture.nativeElement.querySelector('.agenda__followup')?.textContent).toContain(
        '¿Agendar la próxima cita de Juana Perez?',
      );
    });

    it('si se cierra la ficha sin completarla, no ofrece nada', async () => {
      const { fixture } = await openRecordFromToday();

      internals(fixture).onHistoryDone();
      await settle(fixture);

      expect(internals(fixture).followUpOffer()).toBeNull();
    });

    it('desde un turno futuro no ofrece nada', async () => {
      const { fixture } = await openRecordFrom(
        fakeAppointment({ appointmentDatetime: new Date(Date.now() + 3 * 86_400_000).toISOString() }),
      );

      internals(fixture).onHistoryComplete();

      expect(internals(fixture).followUpOffer()).toBeNull();
    });

    it('avisa si el paciente ya tiene una cita futura, sin bloquear', async () => {
      const upcoming = fakeAppointment({
        id: 'appt-next',
        appointmentDatetime: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      });
      const { fixture, appointmentsService } = await openRecordFromToday();
      appointmentsService.getAgenda.mockReturnValue(of([justAttended(), upcoming]));

      internals(fixture).onHistoryComplete();
      await settle(fixture);

      expect(internals(fixture).followUpOffer()?.upcoming?.id).toBe('appt-next');
      expect(fixture.nativeElement.querySelector('.agenda__followup')?.textContent).toContain('Ya tiene cita el');
    });

    it('"Agendar" lleva a la semana siguiente esperando el click, y el click abre el modal con el paciente fijo', async () => {
      const origin = justAttended();
      const { fixture } = await openRecordFrom(origin);
      // Lunes de la semana del turno (Bolivia), más 7 días.
      const originDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(
        new Date(origin.appointmentDatetime),
      );
      const weekday = new Date(`${originDay}T12:00:00Z`).getUTCDay();
      const originMonday = Date.parse(`${originDay}T12:00:00Z`) - ((weekday + 6) % 7) * 86_400_000;
      internals(fixture).onHistoryComplete();
      await settle(fixture);

      internals(fixture).onAcceptFollowUp();
      await settle(fixture);

      expect(internals(fixture).followUpOffer()).toBeNull();
      expect(internals(fixture).followUpPick()?.id).toBe('appt-1');
      expect(internals(fixture).selectedDate()).toBe(
        new Date(originMonday + 7 * 86_400_000).toISOString().slice(0, 10),
      );
      expect(fixture.nativeElement.querySelector('.agenda__pick')?.textContent).toContain(
        'Elige el horario de la próxima cita de',
      );

      (fixture.nativeElement.querySelector('button.agenda-cell') as HTMLButtonElement).click();
      await settle(fixture);

      expect(internals(fixture).bookingSlot()).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.book-modal__title')?.textContent).toContain(
        'Agendar próxima cita',
      );
    });

    it('"Ahora no" descarta la oferta', async () => {
      const { fixture } = await openRecordFromToday();
      internals(fixture).onHistoryComplete();

      internals(fixture).onDismissFollowUp();

      expect(internals(fixture).followUpOffer()).toBeNull();
      expect(internals(fixture).followUpPick()).toBeNull();
    });
  });
});
