import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BookAppointmentDialogComponent } from './book-appointment-dialog';
import { AppointmentsService } from '../../services/appointments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';
import { AuthService } from '../../../../auth/application/auth.service';
import { QuotesService } from '../../../quotes/services/quotes.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';

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

/** CLI-263: presupuesto de p-1 con un pendiente en dos piezas y uno ya realizado. */
const P1_QUOTES = [
  {
    id: 'q-1',
    createdAt: '2026-09-01T00:00:00Z',
    items: [
      { id: 'i-1', applicationGroupId: 'g-1', treatmentId: 't-1', treatmentName: 'Control', toothNumber: 22, procedureId: null, quantity: 1, subtotal: 300 },
      { id: 'i-2', applicationGroupId: 'g-1', treatmentId: 't-1', treatmentName: 'Control', toothNumber: 21, procedureId: null, quantity: 1, subtotal: 300 },
      { id: 'i-3', applicationGroupId: null, treatmentId: 't-1', treatmentName: 'Control', toothNumber: 16, procedureId: 'proc-1', quantity: 1, subtotal: 100 },
    ],
  },
];

/** CLI-266: examen vigente de p-1 — caries en la 16 (ya tratada después) y en la 26, y la 22 que ya está en el plan. */
const P1_EXAM = {
  recordedAt: '2026-09-01T14:00:00Z',
  findings: [
    { diagnosisCode: 'caries', diagnosisName: 'Caries', toothNumber: 16 },
    { diagnosisCode: 'caries', diagnosisName: 'Caries', toothNumber: 26 },
    { diagnosisCode: 'fractura', diagnosisName: 'Fractura', toothNumber: 22 },
  ],
};
const P1_PROCEDURES = [{ treatmentId: 't-1', toothNumber: 16, procedureDate: '2026-09-10' }];
const DIAGNOSES = [
  {
    diagnoses: [
      { code: 'caries', suggestedTreatmentIds: ['t-3', 't-2'] },
      { code: 'fractura', suggestedTreatmentIds: ['t-1'] },
    ],
  },
];

function setup(options: { createResult?: unknown; recentIds?: unknown } = {}) {
  const quotesService = {
    getByPatient: vi.fn((id: string) => of(id === 'p-1' ? P1_QUOTES : [])),
  };
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
          getRecentlyTreatedIds: () => options.recentIds ?? of(['p-2', 'p-1']),
          getCurrentDentalExam: (id: string) => of(id === 'p-1' ? P1_EXAM : null),
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
              {
                id: 't-3',
                name: 'Resina',
                estimatedMinutes: 40,
                isActive: true,
                categoryCode: 'c',
                categoryName: 'C',
                categoryColor: '#000',
              },
            ]),
          getToothProcedures: (id: string) => of(id === 'p-1' ? P1_PROCEDURES : []),
        },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'doctor-a' }) } },
      { provide: QuotesService, useValue: quotesService },
      { provide: DiagnosesService, useValue: { getCatalog: () => of(DIAGNOSES) } },
    ],
  });
  const fixture = TestBed.createComponent(BookAppointmentDialogComponent);
  fixture.componentRef.setInput('slot', { date: MONDAY, minutes: 10 * 60 });
  fixture.componentRef.setInput('schedule', [{ weekday: 1, start: '09:00', end: '12:00' }]);
  return { fixture, appointmentsService, quotesService };
}

type Internals = {
  patientOptions: () => { id: string; label: string; groupId: string }[];
  treatmentOptions: () => { id: string; label: string; groupLabel: string; hint?: string }[];
  notes: () => string;
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
    ).toEqual(['t-1', 't-3']);
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

  // CLI-263
  describe('pendientes del presupuesto', () => {
    it('al elegir el paciente, sus tratamientos por realizar aparecen primero', () => {
      const { fixture, quotesService } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      fixture.detectChanges();

      const options = internals(fixture).treatmentOptions();
      expect(quotesService.getByPatient).toHaveBeenCalledWith('p-1');
      expect(options[0]).toMatchObject({
        id: 'plan:g-1',
        label: 'Control · piezas 21, 22',
        groupLabel: 'Del presupuesto',
        hint: '45 min',
      });
      // Lo ya realizado no se ofrece; después vienen las sugerencias del diagnóstico y el catálogo.
      expect(options.map((o) => o.id)).toEqual(['plan:g-1', 'diag:t-3:26', 't-1', 't-3']);
    });

    it('elegir un pendiente agenda su tratamiento con su duración y anota las piezas', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      fixture.detectChanges();
      internals(fixture).onTreatmentChange('plan:g-1');

      expect(internals(fixture).duration()).toBe(45);
      expect(internals(fixture).notes()).toBe('Piezas 21, 22');
      await internals(fixture).onSubmit();

      expect(appointmentsService.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'p-1', treatmentId: 't-1', notes: 'Piezas 21, 22' }),
      );
    });

    it('si cambia de paciente, el pendiente del anterior se descarta', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      fixture.detectChanges();
      internals(fixture).onTreatmentChange('plan:g-1');
      internals(fixture).onPatientChange('p-2');
      fixture.detectChanges();

      expect(internals(fixture).treatmentOptions().map((o) => o.id)).toEqual(['t-1', 't-3']);
      expect((fixture.componentInstance as unknown as { treatmentId: () => string | null }).treatmentId()).toBeNull();
    });
  });

  // CLI-266
  describe('sugerencias para agendar', () => {
    type Shortcuts = { id: string; label: string; itemIds: string[] }[];
    const shortcuts = (fixture: ComponentFixture<BookAppointmentDialogComponent>, name: string) =>
      (fixture.componentInstance as unknown as Record<string, () => Shortcuts>)[name]();

    it('el selector de paciente arranca con los atendidos recientemente, en el orden de la API', () => {
      const { fixture } = setup();
      fixture.detectChanges();

      expect(shortcuts(fixture, 'patientShortcuts')).toEqual([
        { id: 'recent', label: 'Atendidos recientemente', itemIds: ['p-2', 'p-1'] },
      ]);
    });

    it('si la API de recientes falla, el selector queda como antes', () => {
      const { fixture } = setup({ recentIds: throwError(() => new Error('500')) });
      fixture.detectChanges();

      expect(shortcuts(fixture, 'patientShortcuts')[0].itemIds).toEqual([]);
      expect(internals(fixture).patientOptions()).toHaveLength(2);
    });

    it('los tratamientos arrancan con el presupuesto y siguen con el diagnóstico, sin lo ya tratado ni lo ya presupuestado', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      fixture.detectChanges();

      expect(shortcuts(fixture, 'treatmentShortcuts')).toEqual([
        { id: 'plan', label: 'Del presupuesto', itemIds: ['plan:g-1'] },
        // La 16 se trató después del examen y la 22 ya está en el plan; t-2 está inactivo.
        { id: 'diagnosis', label: 'Según su diagnóstico', itemIds: ['diag:t-3:26'] },
      ]);
      expect(internals(fixture).treatmentOptions().find((o) => o.id === 'diag:t-3:26')).toMatchObject({
        label: 'Resina · pieza 26 (caries)',
        groupLabel: 'Según su diagnóstico',
        hint: '40 min',
      });
    });

    it('elegir una sugerencia del diagnóstico agenda ese tratamiento con su duración y su pieza', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      fixture.detectChanges();
      internals(fixture).onTreatmentChange('diag:t-3:26');

      expect(internals(fixture).duration()).toBe(40);
      expect(internals(fixture).notes()).toBe('Pieza 26');
      await internals(fixture).onSubmit();

      expect(appointmentsService.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'p-1', treatmentId: 't-3', notes: 'Pieza 26' }),
      );
    });

    it('si cambia de paciente, la sugerencia del anterior se descarta', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      fixture.detectChanges();
      internals(fixture).onTreatmentChange('diag:t-3:26');
      internals(fixture).onPatientChange('p-2');
      fixture.detectChanges();

      expect((fixture.componentInstance as unknown as { treatmentId: () => string | null }).treatmentId()).toBeNull();
    });
  });

  // CLI-264
  describe('paciente sin cita', () => {
    it('en un horario de hoy que ya empezó, el título lo dice y la cita se manda como walkIn', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.componentRef.setInput('walkIn', true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#book-modal-title').textContent).toContain('Paciente sin cita');
      internals(fixture).onPatientChange('p-1');
      await internals(fixture).onSubmit();

      expect(appointmentsService.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'p-1', walkIn: true }),
      );
    });

    it('una cita normal no manda walkIn', async () => {
      const { fixture, appointmentsService } = setup();
      fixture.detectChanges();
      internals(fixture).onPatientChange('p-1');
      await internals(fixture).onSubmit();

      expect(appointmentsService.createByDoctor.mock.calls[0][0]).not.toHaveProperty('walkIn');
    });

    it('"Paciente nuevo" pasa la hora y la duración elegidas para registrar su ficha', () => {
      const { fixture } = setup();
      const emitted: unknown[] = [];
      fixture.componentInstance.newPatient.subscribe((e) => emitted.push(e));
      fixture.detectChanges();
      internals(fixture).onStartChange(eventWith('10:15'));
      internals(fixture).onDurationHoursChange(eventWith('1'));
      fixture.detectChanges();

      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.book-modal__new-patient')!.click();

      // 1 h + los 30 min que ya tenía.
      expect(emitted).toEqual([{ minutes: 10 * 60 + 15, durationMinutes: 90 }]);
    });

    it('al reprogramar no se ofrece registrar un paciente nuevo', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('appointment', {
        id: 'a-1',
        patientId: 'p-1',
        patientFirstName: 'Ana',
        patientLastNamePaternal: 'Perez',
        durationMinutes: 30,
        notes: null,
        treatmentName: null,
      });
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('.book-modal__new-patient')).toBeNull();
    });
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
