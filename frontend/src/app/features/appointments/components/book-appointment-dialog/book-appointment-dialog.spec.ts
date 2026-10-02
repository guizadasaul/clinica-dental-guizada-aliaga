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
  onDurationChange: (event: Event) => void;
  onNotesInput: (event: Event) => void;
  onSubmit: () => Promise<void>;
};
const internals = (fixture: ComponentFixture<BookAppointmentDialogComponent>) =>
  fixture.componentInstance as unknown as Internals;
const eventWith = (value: string) => ({ target: { value } }) as unknown as Event;

describe('BookAppointmentDialogComponent (CLI-150)', () => {
  it('muestra el horario clickeado, sin poder editarlo', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(internals(fixture).whenLabel()).toBe('Lunes, 5 de octubre · 10:00 a 10:30');
    expect(
      fixture.nativeElement.querySelector('input[type="date"], input[type="time"]'),
    ).toBeFalsy();
  });

  it('lista solo pacientes con ficha, primero ordenados y separados en míos y otros', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(internals(fixture).patientOptions()).toEqual([
      expect.objectContaining({ id: 'p-1', label: 'Ana Perez · 1234567', groupId: 'mine' }),
      expect.objectContaining({ id: 'p-2', label: 'Zoe Perez', groupId: 'others' }),
    ]);
  });

  it('solo ofrece tratamientos activos, y elegir uno propone su duración redondeada a la grilla', () => {
    const { fixture } = setup();
    fixture.detectChanges();

    expect(
      internals(fixture)
        .treatmentOptions()
        .map((t) => t.id),
    ).toEqual(['t-1']);
    internals(fixture).onTreatmentChange('t-1');
    expect(internals(fixture).duration()).toBe(60);
  });

  it('avisa (sin bloquear) si queda fuera del horario de atención', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(internals(fixture).outsideSchedule()).toBe(false);

    internals(fixture).onDurationChange(eventWith('150'));
    fixture.detectChanges();

    expect(internals(fixture).outsideSchedule()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('fuera de tu horario de atención');
    internals(fixture).onPatientChange('p-1');
    expect(internals(fixture).canSubmit()).toBe(true);
  });

  it('no deja agendar si la duración pisa la próxima cita del día', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('nextBusyMinutes', 11 * 60);
    fixture.detectChanges();
    internals(fixture).onPatientChange('p-1');

    internals(fixture).onDurationChange(eventWith('90'));
    fixture.detectChanges();

    expect(internals(fixture).overlapsNext()).toBe(true);
    expect(internals(fixture).canSubmit()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('se superpone con tu cita de las 11:00');
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
      durationMinutes: 60,
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
      // El <select> muestra la duración de la cita, no la primera opción.
      const select = fixture.nativeElement.querySelector(
        '#book-modal-duration',
      ) as HTMLSelectElement;
      expect(select.value).toBe('90');
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

    it('una duración fuera de la lista se lleva a la grilla', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('appointment', {
        ...existing,
        durationMinutes: 45,
        notes: null,
      });
      fixture.detectChanges();

      expect(internals(fixture).duration()).toBe(60);
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
