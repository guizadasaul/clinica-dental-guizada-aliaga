import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Observable, of, throwError } from 'rxjs';
import { DoctorDashboardComponent } from './doctor-dashboard';
import { AuthService } from '../../../../auth/application/auth.service';
import { AppointmentsService } from '../../../appointments/services/appointments.service';
import type { AppointmentAgendaItem } from '../../../appointments/models/appointment.model';
import type { Patient, PatientInviteContact } from '../../../patients/models/patient.model';

// Hijos reemplazados por stubs con el mismo selector, inputs y outputs: acá se
// prueba la orquestación del panel (qué flujo se muestra y con qué datos), no
// cada pantalla, que tiene su propio spec.
@Component({ selector: 'app-patients-list', standalone: true, template: 'lista' })
class PatientsListStub {
  readonly startWizard = output<string>();
  readonly openOdontogram = output<string>();
  readonly newDiagnosis = output<string>();
  readonly registerDiagnosis = output<Patient>();
  readonly viewClinicalRecord = output<Patient>();
  readonly registerTreatment = output<string>();
  readonly viewHistory = output<string>();
  readonly buildQuote = output<string>();
  readonly sendInvite = output<PatientInviteContact>();
}

@Component({ selector: 'app-patient-wizard', standalone: true, template: 'wizard' })
class PatientWizardStub {
  readonly userId = input('');
  readonly existingPatientId = input<string | null>(null);
  readonly existingPatient = input<Patient | null>(null);
  readonly startStep = input(4);
  readonly examMode = input('correct');
  readonly wizardComplete = output<void>();
  readonly cancelled = output<void>();
}

@Component({ selector: 'app-patient-invite-panel', standalone: true, template: 'invitación' })
class InvitePanelStub {
  readonly patientId = input('');
  readonly initialFirstName = input('');
  readonly initialLastNamePaternal = input('');
  readonly initialPhone = input<string | null>(null);
  readonly initialEmail = input<string | null>(null);
  readonly sent = output<'email' | 'whatsapp'>();
  readonly cancelled = output<void>();
}

@Component({ selector: 'app-register-treatment', standalone: true, template: 'tratamiento' })
class RegisterTreatmentStub {
  readonly patientId = input('');
  readonly done = output<void>();
  readonly cancelled = output<void>();
}

@Component({ selector: 'app-treatment-history', standalone: true, template: 'historial' })
class TreatmentHistoryStub {
  readonly patientId = input('');
  readonly closed = output<void>();
}

@Component({ selector: 'app-clinical-record-view', standalone: true, template: 'historia clínica' })
class ClinicalRecordStub {
  readonly patient = input<Patient | null>(null);
  readonly closed = output<void>();
}

@Component({ selector: 'app-quote-builder', standalone: true, template: 'presupuesto' })
class QuoteBuilderStub {
  readonly patientId = input('');
  readonly closed = output<void>();
}

@Component({ selector: 'app-doctor-agenda', standalone: true, template: 'agenda' })
class AgendaStub {}

@Component({ selector: 'app-testimonial-review', standalone: true, template: 'comentarios' })
class TestimonialReviewStub {}

const PATIENT = { id: 'patient-1', firstName: 'Ana' } as Patient;
const INVITE: PatientInviteContact = {
  patientId: 'patient-1',
  firstName: 'Ana',
  lastNamePaternal: 'Pérez',
  phone: '+59170000000',
  email: null,
} as PatientInviteContact;

function agendaItem(overrides: Partial<AppointmentAgendaItem> = {}): AppointmentAgendaItem {
  return {
    id: 'appt-1',
    appointmentDatetime: '2026-09-24T13:30:00.000Z',
    status: 'confirmed',
    patientId: 'patient-1',
    patientFirstName: 'Ana',
    patientLastNamePaternal: 'Pérez',
    patientPhone: '+59170000000',
    patientEmail: null,
    guestFirstName: null,
    guestLastNamePaternal: null,
    guestPhone: null,
    doctorId: 'doctor-1',
    doctorName: null,
    doctorColor: null,
    ...overrides,
  };
}

function setup(
  options: {
    nav?: string;
    displayName?: string | null;
    agenda?: Observable<AppointmentAgendaItem[]>;
  } = {},
) {
  const appointments = { getAgenda: vi.fn().mockReturnValue(options.agenda ?? of([agendaItem()])) };
  const user = signal(
    options.displayName === undefined
      ? { displayName: 'Ariel Guizada', photoURL: null }
      : { displayName: options.displayName, photoURL: null },
  );
  TestBed.configureTestingModule({
    imports: [DoctorDashboardComponent],
    providers: [
      { provide: AppointmentsService, useValue: appointments },
      { provide: AuthService, useValue: { currentUser: user } },
    ],
  });
  TestBed.overrideComponent(DoctorDashboardComponent, {
    set: {
      imports: [
        PatientsListStub,
        PatientWizardStub,
        InvitePanelStub,
        RegisterTreatmentStub,
        TreatmentHistoryStub,
        ClinicalRecordStub,
        QuoteBuilderStub,
        AgendaStub,
        TestimonialReviewStub,
      ],
    },
  });
  const fixture = TestBed.createComponent(DoctorDashboardComponent);
  fixture.componentRef.setInput('activeNav', options.nav ?? 'home');
  return { fixture, appointments };
}

async function render(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function text(fixture: ReturnType<typeof setup>['fixture']): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function child<T>(
  fixture: ReturnType<typeof setup>['fixture'],
  type: new (...args: never[]) => T,
): T {
  return fixture.debugElement.query(By.directive(type)).componentInstance as T;
}

describe('DoctorDashboardComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('inicio', () => {
    it('saluda al doctor por su primer nombre y muestra sus citas confirmadas de hoy', async () => {
      const { fixture, appointments } = setup();
      await render(fixture);

      expect(text(fixture)).toContain('Dr. Ariel');
      const [[filters]] = appointments.getAgenda.mock.calls as [
        [{ status: string; from: string; to: string }],
      ];
      expect(filters.status).toBe('confirmed');
      // De hoy a mañana, en fechas de La Paz.
      expect(filters.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(filters.to).getTime() - new Date(filters.from).getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
      expect(text(fixture)).toContain('Ana Pérez');
      expect(text(fixture)).toContain('+59170000000');
    });

    it('un invitado sin teléfono muestra un guion', async () => {
      const { fixture } = setup({
        agenda: of([
          agendaItem({
            patientFirstName: null,
            patientPhone: null,
            guestFirstName: 'Luis',
            guestPhone: null,
          }),
        ]),
      });
      await render(fixture);

      expect(text(fixture)).toContain('Luis');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.schedule-item__phone')?.textContent,
      ).toBe('—');
    });

    it('usa el teléfono del invitado si no hay paciente registrado', async () => {
      const { fixture } = setup({
        agenda: of([
          agendaItem({
            patientFirstName: null,
            patientPhone: null,
            guestFirstName: 'Luis',
            guestPhone: '+59171111111',
          }),
        ]),
      });
      await render(fixture);

      expect(text(fixture)).toContain('+59171111111');
    });

    it('si la agenda no carga, muestra el estado vacío', async () => {
      const { fixture } = setup({ agenda: throwError(() => new Error('500')) });
      await render(fixture);

      expect(text(fixture)).toContain('No hay citas programadas para hoy');
    });

    it('sin nombre cargado saluda como "Doctor"', async () => {
      const { fixture } = setup({ displayName: null });
      await render(fixture);

      expect(text(fixture)).toContain('Dr. Doctor');
    });

    it.each([
      [9, 'Buenos días'],
      [15, 'Buenas tardes'],
      [21, 'Buenas noches'],
    ])('a las %i h saluda con "%s"', async (hour, greeting) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 24, hour, 0, 0));
      const { fixture } = setup();
      await render(fixture);

      expect(text(fixture)).toContain(greeting);
    });

    it('las acciones rápidas llevan a la lista de pacientes', async () => {
      const { fixture } = setup();
      const emitted: string[] = [];
      fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));
      await render(fixture);

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('.doctor-action')!
        .click();

      expect(emitted).toEqual(['patients']);
    });
  });

  it.each([
    ['schedule', 'agenda'],
    ['testimonials', 'comentarios'],
  ])('la sección "%s" muestra su pantalla', async (nav, content) => {
    const { fixture } = setup({ nav });
    await render(fixture);

    expect(text(fixture)).toContain(content);
  });

  describe('pacientes', () => {
    async function patients() {
      const context = setup({ nav: 'patients' });
      await render(context.fixture);
      return { ...context, list: child(context.fixture, PatientsListStub) };
    }

    it('arranca en la lista', async () => {
      const { fixture } = await patients();

      expect(text(fixture)).toContain('lista');
    });

    it('registrar un paciente nuevo abre el wizard desde el paso 1 con su usuario', async () => {
      const { fixture, list } = await patients();

      list.startWizard.emit('user-1');
      fixture.detectChanges();

      const wizard = child(fixture, PatientWizardStub);
      expect(wizard.userId()).toBe('user-1');
      expect(wizard.existingPatientId()).toBeNull();
    });

    it('odontograma: abre el examen dental para corregir el vigente', async () => {
      const { fixture, list } = await patients();

      list.openOdontogram.emit('patient-1');
      fixture.detectChanges();

      const wizard = child(fixture, PatientWizardStub);
      expect(wizard.existingPatientId()).toBe('patient-1');
      expect(wizard.startStep()).toBe(4);
      expect(wizard.examMode()).toBe('correct');
    });

    it('nuevo diagnóstico: abre el examen dental en blanco', async () => {
      const { fixture, list } = await patients();

      list.newDiagnosis.emit('patient-1');
      fixture.detectChanges();

      expect(child(fixture, PatientWizardStub).examMode()).toBe('new');
    });

    it('registrar diagnóstico: abre el wizard en el paso 1 con la ficha precargada', async () => {
      const { fixture, list } = await patients();

      list.registerDiagnosis.emit(PATIENT);
      fixture.detectChanges();

      const wizard = child(fixture, PatientWizardStub);
      expect(wizard.startStep()).toBe(1);
      expect(wizard.existingPatient()).toBe(PATIENT);
    });

    it.each([['wizardComplete'], ['cancelled']] as const)(
      'el wizard vuelve a la lista al emitir %s',
      async (event) => {
        const { fixture, list } = await patients();
        list.startWizard.emit('user-1');
        fixture.detectChanges();

        child(fixture, PatientWizardStub)[event].emit();
        fixture.detectChanges();

        expect(text(fixture)).toContain('lista');
      },
    );

    it.each([
      ['viewClinicalRecord', PATIENT, ClinicalRecordStub, 'closed'],
      ['registerTreatment', 'patient-1', RegisterTreatmentStub, 'done'],
      ['registerTreatment', 'patient-1', RegisterTreatmentStub, 'cancelled'],
      ['viewHistory', 'patient-1', TreatmentHistoryStub, 'closed'],
      ['buildQuote', 'patient-1', QuoteBuilderStub, 'closed'],
      ['sendInvite', INVITE, InvitePanelStub, 'cancelled'],
    ] as const)(
      '%s abre su pantalla y "%s" vuelve a la lista',
      async (listEvent, payload, screen, closeEvent) => {
        const { fixture, list } = await patients();

        (list[listEvent] as { emit(value: unknown): void }).emit(payload);
        fixture.detectChanges();
        const opened = child(
          fixture,
          screen as unknown as new (...args: never[]) => Record<string, { emit(): void }>,
        );
        expect(opened).toBeTruthy();
        expect(text(fixture)).not.toContain('lista');

        opened[closeEvent].emit();
        fixture.detectChanges();

        expect(text(fixture)).toContain('lista');
      },
    );

    it('la invitación recibe los datos de contacto del paciente', async () => {
      const { fixture, list } = await patients();

      list.sendInvite.emit(INVITE);
      fixture.detectChanges();

      const panel = child(fixture, InvitePanelStub);
      expect(panel.patientId()).toBe('patient-1');
      expect(panel.initialFirstName()).toBe('Ana');
      expect(panel.initialPhone()).toBe('+59170000000');
    });

    it.each([
      ['email', 'Correo enviado correctamente'],
      ['whatsapp', 'Mensaje de WhatsApp listo para enviar'],
    ] as const)(
      'al enviar por %s vuelve a la lista con un aviso que se va solo',
      async (channel, message) => {
        vi.useFakeTimers();
        const { fixture, list } = await patients();
        list.sendInvite.emit(INVITE);
        fixture.detectChanges();

        child(fixture, InvitePanelStub).sent.emit(channel);
        fixture.detectChanges();
        expect(text(fixture)).toContain(message);
        expect(text(fixture)).toContain('lista');

        vi.advanceTimersByTime(6000);
        fixture.detectChanges();
        expect(text(fixture)).not.toContain(message);
      },
    );

    it('el aviso se puede cerrar antes, y un segundo envío reinicia su tiempo', async () => {
      vi.useFakeTimers();
      const { fixture } = await patients();
      const send = (channel: 'email' | 'whatsapp') => {
        child(fixture, PatientsListStub).sendInvite.emit(INVITE);
        fixture.detectChanges();
        child(fixture, InvitePanelStub).sent.emit(channel);
        fixture.detectChanges();
      };

      send('email');
      vi.advanceTimersByTime(5000);
      send('whatsapp');
      vi.advanceTimersByTime(5000);
      fixture.detectChanges();
      expect(text(fixture)).toContain('WhatsApp');

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('.invite-toast__close')!
        .click();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.invite-toast')).toBeNull();
    });
  });
});
