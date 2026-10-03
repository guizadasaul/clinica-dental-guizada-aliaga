import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BookAppointmentDialogComponent } from './book-appointment-dialog';
import { AppointmentsService } from '../../services/appointments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';
import { AuthService } from '../../../../auth/application/auth.service';

const MONDAY = '2026-10-05';

function patient(
  id: string,
  firstName: string,
  assignedDoctorId: string | null,
  dni: string | null = null,
) {
  return {
    userId: `user-${id}`,
    displayName: firstName,
    email: null,
    phone: null,
    createdAt: '2026-01-01',
    dentalExamsCount: 0,
    hasAccount: true,
    patient: {
      id,
      firstName,
      lastNamePaternal: 'Perez',
      lastNameMaternal: null,
      dni,
      assignedDoctorId,
    },
  };
}

function setup(options: { createResult?: unknown } = {}) {
  const appointmentsService = {
    createByDoctor: vi.fn().mockReturnValue(options.createResult ?? of({ id: 'new' })),
    rescheduleByDoctor: vi.fn().mockReturnValue(options.createResult ?? of({ id: 'moved' })),
  };
  TestBed.configureTestingModule({
    imports: [BookAppointmentDialogComponent],
    providers: [
      { provide: AppointmentsService, useValue: appointmentsService },
      {
        provide: PatientsService,
        useValue: {
          getAll: () =>
            of([
              patient('p-2', 'Zoe', 'doctor-b'),
              patient('p-1', 'Ana', 'doctor-a', '1234567'),
              { ...patient('x', 'Sin ficha', null), patient: null },
            ]),
        },
      },
      {
        provide: TreatmentsService,
        useValue: {
          getAll: () =>
            of([
              {
                id: 't-1',
                name: 'Control',
                estimatedMinutes: 45,
                isActive: true,
                categoryCode: 'c',
                categoryName: 'C',
                categoryColor: '#000',
              },
              {
                id: 't-2',
                name: 'Viejo',
                estimatedMinutes: 30,
                isActive: false,
                categoryCode: 'c',
                categoryName: 'C',
                categoryColor: '#000',
              },
            ]),
        },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'doctor-a' }) } },
    ],
  });
  const fixture = TestBed.createComponent(BookAppointmentDialogComponent);
  fixture.componentRef.setInput('slot', { date: MONDAY, minutes: 10 * 60 });
  fixture.componentRef.setInput('schedule', [{ weekday: 1, start: '09:00', end: '12:00' }]);
  return { fixture, appointmentsService };
}

type Internals = {
  patientOptions: () => { id: string; label: string; groupId: string }[];
  treatmentOptions: () => { id: string }[];
  whenLabel: () => string;
  duration: () => number;
  outsideSchedule: () => boolean;
  overlapsNext: () => boolean;
  canSubmit: () => boolean;
  error: () => string | null;
  onPatientChange: (id: string) => void;
  onTreatmentChange: (id: string) => void;
  onDurationHoursChange: (event: Event) => void;
  onDurationMinutesChange: (event: Event) => void;
  onStartChange: (event: Event) => void;
  startMinutes: () => number;
  conflict: () => { start: number; end: number } | null;
  crossesMidnight: () => boolean;
  durationValid: () => boolean;
  onNotesInput: (event: Event) => void;
  onSubmit: () => Promise<void>;
};
const internals = (fixture: ComponentFixture<BookAppointmentDialogComponent>) =>
  fixture.componentInstance as unknown as Internals;
const eventWith = (value: string) => ({ target: { value } }) as unknown as Event;

describe('BookAppointmentDialogComponent (CLI-150)', () => {
  it('muestra el día clickeado (sin poder cambiarlo) con la hora de inicio editable', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(internals(fixture).whenLabel()).toBe('Lunes, 5 de octubre · 10:00 a 10:30');
    expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeFalsy();
    const start = fixture.nativeElement.querySelector('#book-modal-start') as HTMLInputElement;
    expect(start.value).toBe('10:00');
    expect(start.getAttribute('step')).toBe('300');
  });

  it('lista solo pacientes con ficha, primero ordenados y separados en míos y otros', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(internals(fixture).patientOptions()).toEqual([
      expect.objectContaining({ id: 'p-1', label: 'Ana Perez · 1234567', groupId: 'mine' }),
      expect.objectContaining({ id: 'p-2', label: 'Zoe Perez', groupId: 'others' }),
    ]);
  });

  it('solo ofrece tratamientos activos, y elegir uno propone su duración de 5 en 5 (45 min, no 60)', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(
      internals(fixture)
        .treatmentOptions()
        .map((t) => t.id),
    ).toEqual(['t-1']);
    internals(fixture).onTreatmentChange('t-1');
    expect(internals(fixture).duration()).toBe(45);
  });

  // CLI-194: duración libre en horas y minutos.
  describe('duración en horas y minutos (CLI-194)', () => {
    it('horas y minutos se combinan: 1 h + 15 min = 75 min', () => {
      const { fixture } = setup();
      fixture.detectChanges();

      internals(fixture).onDurationHoursChange(eventWith('1'));
      internals(fixture).onDurationMinutesChange(eventWith('15'));
      fixture.detectChanges();

      expect(internals(fixture).duration()).toBe(75);
      expect(internals(fixture).whenLabel()).toContain('10:00 a 11:15');
    });

    it('ofrece minutos de 5 en 5 y de 0 a 8 horas', () => {
      const { fixture } = setup();
      fixture.detectChanges();

      const hours = [
        ...fixture.nativeElement.querySelectorAll('#book-modal-duration-hours option'),
      ].map((o) => (o as HTMLOptionElement).value);
      const minutes = [
        ...fixture.nativeElement.querySelectorAll('#book-modal-duration-minutes option'),
      ].map((o) => (o as HTMLOptionElement).value);
      expect(hours).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
      expect(minutes).toEqual(['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
    });

    it('los selectores muestran la duración actual (45 min = 0 h 45 min)', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onTreatmentChange('t-1');
      fixture.detectChanges();

      const hours = fixture.nativeElement.querySelector('#book-modal-duration-hours') as HTMLSelectElement;
      const minutes = fixture.nativeElement.querySelector('#book-modal-duration-minutes') as HTMLSelectElement;
      expect(hours.value).toBe('0');
      expect(minutes.value).toBe('45');
    });

    it('el máximo es 8 h en punto: elegir 8 h borra los minutos', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onDurationMinutesChange(eventWith('30'));

      internals(fixture).onDurationHoursChange(eventWith('8'));

      expect(internals(fixture).duration()).toBe(480);
    });

    it('0 h 0 min no se puede agendar: mínimo 5 minutos', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');

      internals(fixture).onDurationMinutesChange(eventWith('0'));
      internals(fixture).onDurationHoursChange(eventWith('0'));
      fixture.detectChanges();

      expect(internals(fixture).durationValid()).toBe(false);
      expect(internals(fixture).canSubmit()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('al menos 5 minutos');
    });

    it('no deja una cita que pase de las 24:00', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');

      internals(fixture).onStartChange(eventWith('23:30'));
      internals(fixture).onDurationHoursChange(eventWith('1'));
      fixture.detectChanges();

      expect(internals(fixture).crossesMidnight()).toBe(true);
      expect(internals(fixture).canSubmit()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('no puede pasar de las 24:00');
    });
  });

  // CLI-194: la hora de inicio también se elige, de 5 en 5.
  describe('hora de inicio editable (CLI-194)', () => {
    it('cambiar la hora de inicio actualiza el resumen y la hora que se manda', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');

      internals(fixture).onStartChange(eventWith('09:45'));
      internals(fixture).onDurationHoursChange(eventWith('1'));
      internals(fixture).onDurationMinutesChange(eventWith('15'));
      fixture.detectChanges();
      expect(internals(fixture).whenLabel()).toContain('09:45 a 11:00');

      await internals(fixture).onSubmit();

      expect(appointmentsService.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentDatetime: '2026-10-05T09:45:00-04:00',
          durationMinutes: 75,
        }),
      );
    });

    it('una hora de inicio inválida se ignora', () => {
      const { fixture } = setup();
      fixture.detectChanges();

      internals(fixture).onStartChange(eventWith(''));
      internals(fixture).onStartChange(eventWith('25:00'));

      expect(internals(fixture).startMinutes()).toBe(10 * 60);
    });

    it('el aviso de fuera de horario sigue la hora elegida, no la clickeada', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      expect(internals(fixture).outsideSchedule()).toBe(false);

      internals(fixture).onStartChange(eventWith('11:45'));
      fixture.detectChanges();

      expect(internals(fixture).outsideSchedule()).toBe(true);
    });

    it('reprogramar manda la nueva hora de inicio cada 5 minutos', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.componentRef.setInput('appointment', {
        id: 'appt-9',
        patientId: 'p-1',
        patientFirstName: 'Ana',
        patientLastNamePaternal: 'Perez',
        treatmentName: null,
        durationMinutes: 30,
        notes: null,
      });
      fixture.detectChanges();

      internals(fixture).onStartChange(eventWith('10:35'));
      await internals(fixture).onSubmit();

      expect(appointmentsService.rescheduleByDoctor).toHaveBeenCalledWith(
        'appt-9',
        expect.objectContaining({ appointmentDatetime: '2026-10-05T10:35:00-04:00' }),
      );
    });
  });

  it('avisa (sin bloquear) si queda fuera del horario de atención', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(internals(fixture).outsideSchedule()).toBe(false);

    internals(fixture).onDurationHoursChange(eventWith('2'));
    internals(fixture).onDurationMinutesChange(eventWith('30'));
    fixture.detectChanges();

    expect(internals(fixture).outsideSchedule()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('fuera de tu horario de atención');
    internals(fixture).onPatientChange('p-1');
    expect(internals(fixture).canSubmit()).toBe(true);
  });

  it('no deja agendar si la hora y la duración pisan otra cita del día', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('busyIntervals', [{ start: 11 * 60, end: 11 * 60 + 30 }]);
    fixture.detectChanges();
    internals(fixture).onPatientChange('p-1');

    internals(fixture).onDurationHoursChange(eventWith('1'));
    internals(fixture).onDurationMinutesChange(eventWith('30'));
    fixture.detectChanges();

    expect(internals(fixture).overlapsNext()).toBe(true);
    expect(internals(fixture).canSubmit()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('se superponen con tu cita de las 11:00');
  });

  it('el choque se calcula con la hora de inicio elegida, también contra una cita que ya empezó', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('busyIntervals', [{ start: 9 * 60, end: 10 * 60 + 15 }]);
    fixture.detectChanges();
    internals(fixture).onPatientChange('p-1');

    // 10:00 cae dentro de la cita de 09:00–10:15.
    expect(internals(fixture).conflict()).toEqual({ start: 9 * 60, end: 10 * 60 + 15 });

    internals(fixture).onStartChange(eventWith('10:15'));
    expect(internals(fixture).conflict()).toBeNull();
    expect(internals(fixture).canSubmit()).toBe(true);
  });

  it('sin paciente no se puede agendar', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(internals(fixture).canSubmit()).toBe(false);
  });

  it('agenda con el ISO de Bolivia y emite la cita creada', async () => {
    const { fixture, appointmentsService } = setup();
    const booked = vi.fn();
    fixture.componentInstance.booked.subscribe(booked);
    fixture.detectChanges();
    internals(fixture).onPatientChange('p-1');
    internals(fixture).onTreatmentChange('t-1');
    internals(fixture).onNotesInput(eventWith('  control  '));

    await internals(fixture).onSubmit();

    expect(appointmentsService.createByDoctor).toHaveBeenCalledWith({
      patientId: 'p-1',
      appointmentDatetime: '2026-10-05T10:00:00-04:00',
      treatmentId: 't-1',
      durationMinutes: 45,
      notes: 'control',
    });
    expect(booked).toHaveBeenCalledWith({ id: 'new' });
  });

  it('ante un 409 queda abierto y explica el choque', async () => {
    const { fixture } = setup({ createResult: throwError(() => ({ status: 409 })) });
    const booked = vi.fn();
    fixture.componentInstance.booked.subscribe(booked);
    fixture.detectChanges();
    internals(fixture).onPatientChange('p-1');

    await internals(fixture).onSubmit();

    expect(booked).not.toHaveBeenCalled();
    expect(internals(fixture).error()).toContain('Ya tienes una cita en ese horario');
  });

  it('muestra el mensaje del backend ante otros errores', async () => {
    const { fixture } = setup({
      createResult: throwError(() => ({
        status: 400,
        error: { message: ['La cita tiene que ser en el futuro'] },
      })),
    });
    fixture.detectChanges();
    internals(fixture).onPatientChange('p-1');

    await internals(fixture).onSubmit();

    expect(internals(fixture).error()).toBe('La cita tiene que ser en el futuro');
  });

  it('cierra con el botón Cancelar y con un click en el fondo', () => {
    const { fixture } = setup();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.book-modal__btn--ghost') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.book-modal') as HTMLElement).click();

    expect(closed).toHaveBeenCalledTimes(2);
  });

  // CLI-151: con una cita, el mismo modal la reprograma al horario clickeado.
  describe('modo reprogramar', () => {
    const existing = {
      id: 'appt-1',
      appointmentDatetime: '2026-10-05T13:00:00.000Z',
      status: 'confirmed',
      patientId: 'p-1',
      patientFirstName: 'Ana',
      patientLastNamePaternal: 'Perez',
      patientPhone: null,
      patientEmail: null,
      guestFirstName: null,
      guestLastNamePaternal: null,
      guestPhone: null,
      doctorId: 'doctor-a',
      doctorName: 'Dr. Saul',
      doctorColor: null,
      durationMinutes: 90,
      source: 'doctor',
      treatmentId: 't-1',
      treatmentName: 'Control',
      notes: 'traer radiografía',
      cancelledAt: null,
    };

    it('muestra paciente y tratamiento fijos, con la duración y notas de la cita', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('appointment', existing);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Reprogramar cita');
      expect(text).toContain('Ana Perez');
      expect(text).toContain('Control');
      expect(fixture.nativeElement.querySelector('app-catalog-picker')).toBeFalsy();
      expect(internals(fixture).duration()).toBe(90);
      expect(internals(fixture).canSubmit()).toBe(true);
      // Los <select> muestran la duración de la cita (1 h 30 min), no la primera opción.
      const hours = fixture.nativeElement.querySelector(
        '#book-modal-duration-hours',
      ) as HTMLSelectElement;
      const minutes = fixture.nativeElement.querySelector(
        '#book-modal-duration-minutes',
      ) as HTMLSelectElement;
      expect(hours.value).toBe('1');
      expect(minutes.value).toBe('30');
    });

    it('reprograma al horario clickeado, mandando duración y notas', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.componentRef.setInput('appointment', existing);
      const booked = vi.fn();
      fixture.componentInstance.booked.subscribe(booked);
      fixture.detectChanges();
      internals(fixture).onNotesInput(eventWith(''));

      await internals(fixture).onSubmit();

      expect(appointmentsService.createByDoctor).not.toHaveBeenCalled();
      expect(appointmentsService.rescheduleByDoctor).toHaveBeenCalledWith('appt-1', {
        appointmentDatetime: '2026-10-05T10:00:00-04:00',
        durationMinutes: 90,
        notes: '',
      });
      expect(booked).toHaveBeenCalledWith({ id: 'moved' });
    });

    it('una duración que no es múltiplo de 5 se lleva al siguiente múltiplo de 5', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('appointment', {
        ...existing,
        durationMinutes: 47,
        notes: null,
      });
      fixture.detectChanges();

      expect(internals(fixture).duration()).toBe(50);
    });
  });

  // CLI-152: próxima cita de un paciente recién atendido.
  it('con followUpOf arranca con el paciente fijo y el tratamiento y la duración de la cita de origen', async () => {
    const { fixture, appointmentsService } = setup();
    fixture.componentRef.setInput('followUpOf', {
      id: 'appt-origin',
      appointmentDatetime: '2026-09-28T14:00:00.000Z',
      status: 'confirmed',
      patientId: 'p-2',
      patientFirstName: 'Zoe',
      patientLastNamePaternal: 'Perez',
      patientPhone: null,
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
      treatmentName: 'Control',
      notes: null,
      cancelledAt: null,
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Agendar próxima cita');
    expect(text).toContain('Zoe Perez');
    expect(internals(fixture).duration()).toBe(60);
    expect(internals(fixture).canSubmit()).toBe(true);

    await internals(fixture).onSubmit();

    expect(appointmentsService.createByDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p-2', treatmentId: 't-1', durationMinutes: 60 }),
    );
  });
});
