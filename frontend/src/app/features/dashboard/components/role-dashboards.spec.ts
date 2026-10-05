import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { PatientDashboardComponent } from './patient-dashboard/patient-dashboard';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AuthService } from '../../../auth/application/auth.service';
import { PatientsService } from '../../patients/services/patients.service';
import { AppointmentsService } from '../../appointments/services/appointments.service';
import type { PatientAppointment } from '../../appointments/models/appointment.model';
import { LogoComponent } from '../../../shared/ui/logo/logo';
import { ReportsService } from '../../reports/services/reports.service';
import { KpiCardComponent } from '../../reports/components/kpi-card/kpi-card';
import type { FinancialReport, OperationalReport } from '../../reports/models/report.model';

@Component({ selector: 'app-treatment-history', standalone: true, template: 'historial' })
class TreatmentHistoryStub {
  readonly patientId = input('');
  readonly mine = input(false);
  readonly closed = output<void>();
}
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
  function setup(
    nav: string,
    patient: { id: string } | null = { id: 'patient-1' },
    name: string | null = 'Ana Pérez',
    upcoming: Observable<PatientAppointment[]> = of([]),
  ) {
    TestBed.configureTestingModule({
      imports: [PatientDashboardComponent],
      providers: [
        auth(name),
        {
          provide: PatientsService,
          useValue: { getMyPatientStatus: () => of({ exists: patient !== null, patient }) },
        },
        { provide: AppointmentsService, useValue: { getMyUpcoming: () => upcoming } },
      ],
    });
    TestBed.overrideComponent(PatientDashboardComponent, {
      set: { imports: [TreatmentHistoryStub, LogoComponent] },
    });
    const fixture = TestBed.createComponent(PatientDashboardComponent);
    fixture.componentRef.setInput('activeNav', nav);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('en el inicio saluda por el primer nombre, o como "Paciente" si no hay nombre', () => {
    expect(setup('home').root.textContent).toContain('Ana');
    TestBed.resetTestingModule();
    expect(setup('home', null, null).root.textContent).toContain('Paciente');
  });

  // CLI-153: la tarjeta "Próxima cita" muestra las citas reales del paciente.
  describe('próxima cita', () => {
    const cita = (id: string, iso: string, extra: Partial<PatientAppointment> = {}): PatientAppointment => ({
      id,
      appointmentDatetime: iso,
      durationMinutes: 60,
      doctorName: 'Saul Guizada',
      treatmentName: 'Control de ortodoncia',
      ...extra,
    });

    it('muestra la más cercana con fecha, hora, doctor y tratamiento, y cuenta las demás', () => {
      const { root } = setup(
        'home',
        undefined,
        undefined,
        of([
          cita('a', '2026-09-29T14:00:00.000Z'),
          cita('b', '2026-10-06T14:00:00.000Z', { treatmentName: null }),
        ]),
      );
      const text = root.textContent ?? '';

      expect(text).toContain('Martes, 29 de septiembre');
      expect(text).toContain('10:00');
      expect(text).toContain('Saul Guizada');
      expect(text).toContain('Control de ortodoncia');
      expect(text).toContain('Y 1 más:');
      expect(root.querySelector('.stat-card__value')?.textContent).toContain('29');
      expect(root.querySelector('.appointment-empty')).toBeNull();
    });

    it('sin citas muestra el estado vacío de siempre', () => {
      const { root } = setup('home');

      expect(root.querySelector('.appointment-empty')?.textContent).toContain('No tienes citas programadas');
      expect(root.querySelector('.stat-card__value')?.textContent?.trim()).toBe('—');
    });

    it('si falla la consulta, también muestra el estado vacío', () => {
      const { root } = setup('home', undefined, undefined, throwError(() => new Error('500')));

      expect(root.querySelector('.appointment-empty')).toBeTruthy();
    });

    it('mientras carga lo dice', () => {
      const { root } = setup('home', undefined, undefined, NEVER);

      expect(root.textContent).toContain('Cargando tus citas...');
    });
  });

  it('el acceso a "Mi historial" pide cambiar de sección', () => {
    const { fixture, root } = setup('home');
    const emitted: string[] = [];
    fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));

    root.querySelector<HTMLButtonElement>('.action-card--tertiary')!.click();

    expect(emitted).toEqual(['history']);
  });

  it('el historial muestra los tratamientos de su propia ficha y al cerrarlo vuelve al inicio', () => {
    const { fixture } = setup('history');
    const emitted: string[] = [];
    fixture.componentInstance.navChange.subscribe((nav) => emitted.push(nav));
    const history = fixture.debugElement.query(By.directive(TreatmentHistoryStub))
      .componentInstance as TreatmentHistoryStub;

    expect(history.patientId()).toBe('patient-1');
    // CLI-102: el paciente pide su historial por sesión, no por id.
    expect(history.mine()).toBe(true);
    history.closed.emit();

    expect(emitted).toEqual(['home']);
  });

  it('sin ficha de paciente, el historial no se muestra', () => {
    const { fixture } = setup('history', null);

    expect(fixture.debugElement.query(By.directive(TreatmentHistoryStub))).toBeNull();
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
