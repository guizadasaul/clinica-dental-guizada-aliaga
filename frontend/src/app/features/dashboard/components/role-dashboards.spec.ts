import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { PatientDashboardComponent } from './patient-dashboard/patient-dashboard';
import { AppointmentTicketComponent } from '../../../shared/ui/appointment-ticket/appointment-ticket';
import { WhatsappIconComponent } from '../../../shared/ui/whatsapp-icon/whatsapp-icon';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AuthService } from '../../../auth/application/auth.service';
import { PatientsService } from '../../patients/services/patients.service';
import { AppointmentsService } from '../../appointments/services/appointments.service';
import type { PatientAppointment } from '../../appointments/models/appointment.model';
import { QuotesService } from '../../quotes/services/quotes.service';
import type { Quote, QuoteLine } from '../../quotes/models/quote.model';
import { LogoComponent } from '../../../shared/ui/logo/logo';
import { ReportsService } from '../../reports/services/reports.service';
import { KpiCardComponent } from '../../reports/components/kpi-card/kpi-card';
import type { FinancialReport, OperationalReport } from '../../reports/models/report.model';

@Component({ selector: 'app-my-treatment-history', standalone: true, template: 'historial' })
class MyTreatmentHistoryStub {}
@Component({ selector: 'app-my-visits', standalone: true, template: 'mis citas' })
class MyVisitsStub {}
@Component({ selector: 'app-my-profile', standalone: true, template: 'mi perfil' })
class MyProfileStub {}
@Component({ selector: 'app-admin-doctors', standalone: true, template: 'doctores' })
class AdminDoctorsStub {}
@Component({ selector: 'app-reports-page', standalone: true, template: 'reportes' })
class ReportsStub {}
@Component({ selector: 'app-testimonial-review', standalone: true, template: 'comentarios' })
class TestimonialReviewStub {}

function auth(displayName: string | null) {
  return { provide: AuthService, useValue: { currentUser: signal({ displayName }) } };
}

describe('PatientDashboardComponent', () => {
  interface SetupOptions {
    patient?: { id: string } | null;
    name?: string | null;
    upcoming?: Observable<PatientAppointment[]>;
    past?: Observable<PatientAppointment[]>;
    quotes?: Observable<Partial<Quote>[]>;
  }

  function setup(nav: string, options: SetupOptions = {}) {
    const patient = options.patient === undefined ? { id: 'patient-1' } : options.patient;
    TestBed.configureTestingModule({
      imports: [PatientDashboardComponent],
      providers: [
        auth(options.name === undefined ? 'Ana Pérez' : options.name),
        {
          provide: PatientsService,
          useValue: { getMyPatientStatus: () => of({ exists: patient !== null, patient }) },
        },
        {
          provide: AppointmentsService,
          useValue: {
            getMyUpcoming: () => options.upcoming ?? of([]),
            getMyPast: () => options.past ?? of([]),
          },
        },
        { provide: QuotesService, useValue: { getMine: () => options.quotes ?? of([]) } },
      ],
    });
    TestBed.overrideComponent(PatientDashboardComponent, {
      set: { imports: [MyTreatmentHistoryStub, MyVisitsStub, MyProfileStub, AppointmentTicketComponent, WhatsappIconComponent] },
    });
    const fixture = TestBed.createComponent(PatientDashboardComponent);
    fixture.componentRef.setInput('activeNav', nav);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const cita = (id: string, iso: string, extra: Partial<PatientAppointment> = {}): PatientAppointment => ({
    id,
    appointmentDatetime: iso,
    durationMinutes: 60,
    doctorName: 'Saul Guizada',
    treatmentName: 'Control de ortodoncia',
    status: 'confirmed',
    ...extra,
  });

  it('en el inicio saluda por el primer nombre, o como "Paciente" si no hay nombre', () => {
    expect(setup('home').root.textContent).toContain('Ana');
    TestBed.resetTestingModule();
    expect(setup('home', { patient: null, name: null }).root.textContent).toContain('Paciente');
  });

  // CLI-209: sin accesos rápidos, sin "Tratamientos activos" ni "Solicitar cita".
  it('ya no muestra accesos rápidos ni la solicitud de citas', () => {
    const text = setup('home').root.textContent ?? '';

    expect(text).not.toContain('Acciones rápidas');
    expect(text).not.toContain('Tratamientos activos');
    expect(text).not.toContain('Solicitar cita');
  });

  // CLI-267: la próxima cita es la tarjeta protagonista del inicio.
  describe('próxima cita', () => {
    it('muestra la más cercana como tarjeta de cita, lo dice bajo el saludo y ofrece ir a las demás', () => {
      const { fixture, root } = setup('home', {
        upcoming: of([
          cita('a', '2026-09-29T14:00:00.000Z'),
          cita('b', '2026-10-06T14:00:00.000Z', { treatmentName: null }),
        ]),
      });
      const tickets = root.querySelectorAll('app-appointment-ticket');
      const ticket = tickets[0];
      const emitted: string[] = [];
      fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));

      // Solo la más cercana es protagonista; las demás están en "Mis citas".
      expect(tickets).toHaveLength(1);
      expect(ticket.classList).toContain('ticket--hero');
      expect(ticket.querySelector('.ticket__day')?.textContent).toBe('29');
      expect(ticket.querySelector('.ticket__weekday')?.textContent).toBe('Martes');
      expect(ticket.querySelector('.ticket__time')?.textContent).toBe('10:00 – 11:00');
      expect(ticket.querySelector('.ticket__title')?.textContent).toBe('Control de ortodoncia');
      expect(ticket.querySelector('.ticket__doctor')?.textContent).toContain('Saul Guizada');
      expect(root.querySelector('.patient__lede')?.textContent).toContain('Tu próxima cita es');
      const more = root.querySelector<HTMLButtonElement>('.patient__link')!;
      expect(more.textContent).toContain('Y 1 cita más');
      more.click();
      expect(emitted).toEqual(['appointments']);
    });

    it('sin citas muestra el estado vacío, sin botón para solicitar', () => {
      const { root } = setup('home');

      expect(root.querySelector('.patient-empty')?.textContent).toContain('No tienes citas programadas');
      expect(root.querySelector('.patient-empty button')).toBeNull();
      expect(root.querySelector('.patient__lede')?.textContent).toContain('Por ahora no tienes citas programadas');
    });

    it('si falla la consulta, también muestra el estado vacío', () => {
      const { root } = setup('home', { upcoming: throwError(() => new Error('500')) });

      expect(root.querySelector('.patient-empty')).toBeTruthy();
    });

    it('mientras carga lo dice', () => {
      const { root } = setup('home', { upcoming: NEVER });

      expect(root.textContent).toContain('Cargando tus citas...');
      // Mientras carga no afirma nada bajo el saludo.
      expect(root.querySelector('.patient__lede')).toBeNull();
    });
  });

  // CLI-267: primero el saldo, después las visitas.
  describe('resumen', () => {
    const kpi = (root: HTMLElement, i: number) => root.querySelectorAll('.kpi')[i === 0 ? 1 : 0];

    it('cuenta las visitas pasadas sin las "No asistió"', () => {
      const { root } = setup('home', {
        past: of([
          cita('c', '2026-09-10T14:00:00.000Z'),
          cita('b', '2026-08-10T14:00:00.000Z', { status: 'no_show' }),
          cita('a', '2025-03-14T14:00:00.000Z', { status: 'attended' }),
        ]),
      });

      expect(kpi(root, 0).querySelector('.kpi__value')?.textContent?.trim()).toBe('2');
      expect(kpi(root, 0).querySelector('.kpi__label')?.textContent).toContain('Visitas a la clínica');
    });

    it('una sola visita va en singular; mientras carga, un guion', () => {
      const one = setup('home', { past: of([cita('a', '2026-09-10T14:00:00.000Z')]) });
      expect(kpi(one.root, 0).querySelector('.kpi__label')?.textContent).toContain('Visita a la clínica');
      TestBed.resetTestingModule();
      const loading = setup('home', { past: NEVER, quotes: NEVER });
      expect(kpi(loading.root, 0).querySelector('.kpi__value')?.textContent?.trim()).toBe('—');
      expect(kpi(loading.root, 1).querySelector('.kpi__value')?.textContent?.trim()).toBe('—');
    });

    it('el saldo suma los presupuestos compartidos y "Ver presupuesto" lleva a esa sección', () => {
      const { fixture, root } = setup('home', {
        quotes: of([
          { totalAmount: 1000, totalPaid: 400, balance: 600 },
          { totalAmount: 1000, totalPaid: 900, balance: 100 },
        ]),
      });
      const emitted: string[] = [];
      fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));

      expect(kpi(root, 1).querySelector('.kpi__value')?.textContent).toContain('Bs. 700,00');
      // Si debe algo, el saldo se marca.
      expect(kpi(root, 1).classList).toContain('kpi--owes');
      root.querySelector<HTMLButtonElement>('.kpi__link')!.click();
      expect(emitted).toEqual(['quote']);
    });
  });

  // CLI-262
  describe('pendientes', () => {
    const line = (key: string, extra: Partial<QuoteLine>): QuoteLine => ({
      key,
      treatmentName: key,
      toothNumbers: [],
      total: 100,
      paid: 0,
      pending: 100,
      performedAt: null,
      ...extra,
    });
    const items = (root: HTMLElement, group: number) =>
      [...root.querySelectorAll('.pending__group')[group].querySelectorAll('.pending__item')].map((i) =>
        i.textContent!.replace(/\s+/g, ' ').trim(),
      );

    it('lista lo que falta realizar y lo que falta pagar, y lleva al presupuesto', () => {
      const { fixture, root } = setup('home', {
        quotes: of([
          {
            balance: 450,
            lines: [
              line('Resina', { toothNumbers: [16], performedAt: '2026-09-01', paid: 50, pending: 50 }),
              line('Conducto', { toothNumbers: [21, 22], total: 400, pending: 400 }),
              line('Limpieza', { performedAt: '2026-08-01', paid: 100, pending: 0 }),
            ],
          },
        ]),
      });
      const emitted: string[] = [];
      fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));

      expect(items(root, 0)).toEqual(['Conducto · piezas 21, 22']);
      expect(items(root, 1)).toEqual(['Resina · pieza 16Bs. 50,00', 'Conducto · piezas 21, 22Bs. 400,00']);
      [...root.querySelectorAll<HTMLButtonElement>('.patient__link')].find((b) => b.textContent?.includes('Ver mi presupuesto'))!.click();
      expect(emitted).toEqual(['quote']);
    });

    it('al día, lo dice', () => {
      const { root } = setup('home', {
        quotes: of([{ balance: 0, lines: [line('Limpieza', { performedAt: '2026-08-01', paid: 100, pending: 0 })] }]),
      });
      expect(root.textContent).toContain('Estás al día');
      expect(root.querySelector('.pending')).toBeNull();
    });
  });

  it('el contacto abre WhatsApp de la clínica con un mensaje con su nombre, sin emojis', () => {
    const link = setup('home').root.querySelector<HTMLAnchorElement>('.patient__whatsapp')!;
    // CLI-268: con el logo de WhatsApp, no el ícono genérico de chat.
    expect(link.querySelector('app-whatsapp-icon svg')).not.toBeNull();
    expect(link.textContent).not.toContain('chat');
    const url = new URL(link.href);

    expect(url.origin + url.pathname).toBe('https://wa.me/59157744250');
    expect(url.searchParams.get('text')).toBe(
      'Hola, soy Ana Pérez. Quisiera hacer una consulta sobre mi atención en la clínica.',
    );
    expect(link.target).toBe('_blank');
  });

  it('"Mis citas" muestra el registro de visitas (CLI-210)', () => {
    const { fixture } = setup('appointments');

    expect(fixture.debugElement.query(By.directive(MyVisitsStub))).toBeTruthy();
  });

  it('"Mi perfil" muestra la historia clínica inicial (CLI-214)', () => {
    const { fixture } = setup('profile');

    expect(fixture.debugElement.query(By.directive(MyProfileStub))).toBeTruthy();
  });

  it('"Mi historial" muestra los tratamientos recibidos (CLI-211)', () => {
    const { fixture } = setup('history');

    expect(fixture.debugElement.query(By.directive(MyTreatmentHistoryStub))).toBeTruthy();
  });

  it('sin ficha de paciente, el historial no se muestra', () => {
    const { fixture } = setup('history', { patient: null });

    expect(fixture.debugElement.query(By.directive(MyTreatmentHistoryStub))).toBeNull();
  });

  it.each([
    [9, 'Buenos días'],
    [15, 'Buenas tardes'],
    [21, 'Buenas noches'],
  ])('a las %i h saluda con "%s"', (hour, greeting) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, hour));

    expect(setup('home').root.textContent).toContain(greeting);
    vi.useRealTimers();
  });
});

describe('AdminDashboardComponent', () => {
  function operational(total: number, cancelled: number, confirmed: number): OperationalReport {
    return {
      from: '2026-09-01',
      to: '2026-09-30',
      cancellations: [],
      doctors: [
        {
          doctorId: 'doctor-1',
          doctorName: 'Juan Perez',
          appointmentsByStatus: { confirmed, cancelled },
          totalAppointments: total,
          newPatients: 2,
          theoreticalSlots: 10,
          confirmedAppointments: confirmed,
          occupancyRate: confirmed / 10,
        },
      ],
    };
  }

  function financial(collected: number): FinancialReport {
    return {
      from: '2026-09-01',
      to: '2026-09-30',
      doctors: [{ doctorId: 'doctor-1', doctorName: 'Juan Perez', collected, pending: 250 }],
    };
  }

  function reportsService(fails = false) {
    // Primera llamada = últimos 30 días; segunda = los 30 anteriores.
    const getOperational = vi
      .fn()
      .mockReturnValueOnce(of(operational(8, 1, 4)))
      .mockReturnValueOnce(of(operational(4, 2, 2)));
    const getFinancial = vi
      .fn()
      .mockReturnValueOnce(fails ? throwError(() => new Error('boom')) : of(financial(1500)))
      .mockReturnValue(of(financial(1000)));
    return { getOperational, getFinancial };
  }

  function setup(nav: string, name: string | null = 'Marylu Aliaga', service = reportsService()) {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [auth(name), { provide: ReportsService, useValue: service }],
    });
    TestBed.overrideComponent(AdminDashboardComponent, {
      set: { imports: [AdminDoctorsStub, ReportsStub, TestimonialReviewStub, LogoComponent, KpiCardComponent] },
    });
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.componentRef.setInput('activeNav', nav);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, service };
  }

  // loadKpis encadena varios firstValueFrom: dejar correr las microtareas antes de mirar el DOM.
  async function settle(fixture: { detectChanges: () => void }) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  it('en el inicio saluda por el primer nombre, o como "Administrador"', () => {
    expect(setup('home').root.textContent).toContain('Marylu');
    TestBed.resetTestingModule();
    expect(setup('home', null).root.textContent).toContain('Administrador');
  });

  it('ya no muestra los accesos rápidos', () => {
    const { root } = setup('home');
    expect(root.querySelector('.action-card')).toBeNull();
    expect(root.textContent).not.toContain('Accesos rápidos');
  });

  it('muestra los KPI de los últimos 30 días con la variación contra el período anterior', async () => {
    const { fixture, root, service } = setup('home');
    await settle(fixture);

    const cards = Array.from(root.querySelectorAll('app-kpi-card')).map((c) => c.textContent ?? '');
    expect(cards).toHaveLength(6);
    expect(cards[0]).toContain('Citas');
    expect(cards[0]).toContain('8');
    expect(cards[0]).toContain('+100%');
    expect(cards[1]).toContain('Bs. 1.500,00');
    expect(cards[1]).toContain('+50%');
    expect(cards[2]).toContain('Saldo actual por cobrar');
    expect(cards[3]).toContain('40%');
    expect(cards[5]).toContain('-50%');

    const [current, previous] = service.getOperational.mock.calls.map((call) => call[0]);
    expect(previous.to < current.from).toBe(true);
  });

  it('las canceladas que bajan se marcan como buena noticia', async () => {
    const { fixture, root } = setup('home');
    await settle(fixture);
    const cancelled = root.querySelectorAll('app-kpi-card')[5];
    expect(cancelled.querySelector('.kpi-card__delta--good')).not.toBeNull();
  });

  it('si falla la carga muestra el error y permite reintentar', async () => {
    const { fixture, root, service } = setup('home', 'Marylu Aliaga', reportsService(true));
    await settle(fixture);
    expect(root.textContent).toContain('No se pudieron cargar los reportes rápidos.');

    service.getOperational.mockReturnValue(of(operational(8, 1, 4)));
    root.querySelector<HTMLButtonElement>('.admin__retry')!.click();
    await settle(fixture);
    expect(root.querySelectorAll('app-kpi-card')).toHaveLength(6);
  });

  it('"Ver todos los reportes" lleva a la sección Reportes', () => {
    const { fixture, root } = setup('home');
    const emitted: string[] = [];
    fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));
    root.querySelector<HTMLButtonElement>('.admin__link')!.click();
    expect(emitted).toEqual(['reports']);
  });

  it.each([
    ['doctors', 'doctores'],
    ['reports', 'reportes'],
    ['testimonials', 'comentarios'],
  ])('la sección "%s" muestra su pantalla', (nav, content) => {
    expect(setup(nav).root.textContent).toContain(content);
  });

  it.each([
    [9, 'Buenos días'],
    [15, 'Buenas tardes'],
    [21, 'Buenas noches'],
  ])('a las %i h saluda con "%s"', (hour, greeting) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, hour));

    expect(setup('home').root.textContent).toContain(greeting);
    vi.useRealTimers();
  });
});
