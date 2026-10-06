import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { ReportsPageComponent } from './reports-page';
import { ReportsService } from '../../services/reports.service';
import { Component, input } from '@angular/core';
import { AdminDoctorsService } from '../../../admin/services/admin-doctors.service';
import type { AdminDoctorSummary } from '../../../admin/models/admin-doctor.model';
import type { FinancialReport, OperationalReport, TrendsReport } from '../../models/report.model';
import { ChartComponent } from '../../../../shared/ui/chart/chart';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { KpiCardComponent } from '../kpi-card/kpi-card';

const DOCTORS: AdminDoctorSummary[] = [
  {
    id: 'doctor-1',
    displayName: 'Juan Perez',
    firstName: 'Juan',
    lastNamePaternal: 'Perez',
    lastNameMaternal: null,
    registrationStatus: 'active',
    email: null,
    phone: null,
    specialty: null,
    photoUrl: null,
    displayOrder: 0,
    isBookable: true,
    isActive: true,
    color: '#2563eb',
  },
  {
    id: 'doctor-2',
    displayName: 'Dra. Ana Arce',
    firstName: 'Ana',
    lastNamePaternal: 'Arce',
    lastNameMaternal: null,
    registrationStatus: 'active',
    email: null,
    phone: null,
    specialty: null,
    photoUrl: null,
    displayOrder: 1,
    isBookable: false,
    isActive: false,
    color: '#16a34a',
  },
];

/** ECharts no corre en jsdom: el stub expone la opción para revisarla. */
@Component({ selector: 'app-chart', standalone: true, template: '<div class="chart-stub"></div>' })
class ChartStub {
  readonly option = input<unknown>();
  readonly height = input(280);
}

const OPERATIONAL_REPORT: OperationalReport = {
  from: '2026-08-17',
  to: '2026-09-16',
  doctors: [
    {
      doctorId: 'doctor-1',
      doctorName: 'Juan Perez',
      appointmentsByStatus: { confirmed: 3, held: 1, expired: 2, cancelled: 2 },
      totalAppointments: 6,
      newPatients: 4,
      theoreticalSlots: 10,
      confirmedAppointments: 3,
      occupancyRate: 0.3,
    },
  ],
  cancellations: [
    {
      appointmentId: 'appt-1',
      appointmentDatetime: '2026-09-01T14:00:00.000Z',
      doctorId: 'doctor-1',
      doctorName: 'Juan Perez',
      patientName: 'Ana Arce',
      cancelledAt: '2026-08-31T20:30:00.000Z',
      cancelledByName: 'Juan Perez',
      cancelReason: 'El paciente viaja',
    },
    {
      appointmentId: 'appt-2',
      appointmentDatetime: '2026-09-02T14:00:00.000Z',
      doctorId: 'doctor-1',
      doctorName: 'Juan Perez',
      patientName: 'Beto',
      cancelledAt: null,
      cancelledByName: null,
      cancelReason: null,
    },
  ],
};

const FINANCIAL_REPORT: FinancialReport = {
  from: '2026-08-17',
  to: '2026-09-16',
  doctors: [
    { doctorId: 'doctor-1', doctorName: 'Juan Perez', collected: 1500, pending: 200 },
    { doctorId: null, doctorName: null, collected: 50, pending: 0 },
  ],
};

const PREVIOUS_OPERATIONAL: OperationalReport = {
  ...OPERATIONAL_REPORT,
  doctors: [{ ...OPERATIONAL_REPORT.doctors[0], totalAppointments: 3, appointmentsByStatus: { cancelled: 4 } }],
  cancellations: [],
};

const TRENDS: TrendsReport = {
  from: '2026-09-01',
  to: '2026-09-02',
  days: [
    { date: '2026-09-01', appointmentsByStatus: { confirmed: 2, cancelled: 1 }, collected: 1000 },
    { date: '2026-09-02', appointmentsByStatus: { confirmed: 1, held: 1 }, collected: 550 },
  ],
};

interface SetupOptions {
  operationalFails?: boolean;
  trendsFails?: boolean;
  treatments?: { treatmentId: string; name: string; count: number }[];
}

function setup(options: SetupOptions = {}) {
  // Cada carga pide primero el período actual y después el anterior: la
  // primera llamada a getOperational es la actual, la segunda la anterior.
  const getOperational = vi.fn((filters: { from: string }) =>
    options.operationalFails
      ? throwError(() => new Error('boom'))
      : of(filters.from === currentFrom ? OPERATIONAL_REPORT : PREVIOUS_OPERATIONAL),
  );
  let currentFrom = '';
  const reportsService = {
    getOperational: vi.fn((filters: { from: string }) => {
      if (!currentFrom) {
        currentFrom = filters.from;
      }
      return getOperational(filters);
    }),
    getFinancial: vi.fn().mockReturnValue(of(FINANCIAL_REPORT)),
    getTrends: vi.fn().mockReturnValue(options.trendsFails ? throwError(() => new Error('boom')) : of(TRENDS)),
    getTopTreatments: vi.fn().mockReturnValue(
      of({ from: '', to: '', treatments: options.treatments ?? [{ treatmentId: 't1', name: 'Resina', count: 4 }] }),
    ),
  };
  const adminDoctorsService = { getAll: vi.fn().mockReturnValue(of(DOCTORS)) };
  TestBed.configureTestingModule({
    imports: [ReportsPageComponent],
    providers: [
      { provide: ReportsService, useValue: reportsService },
      { provide: AdminDoctorsService, useValue: adminDoctorsService },
    ],
  });
  TestBed.overrideComponent(ReportsPageComponent, {
    set: { imports: [PageHeaderComponent, KpiCardComponent, ChartStub] },
  });
  const fixture = TestBed.createComponent(ReportsPageComponent);
  return { fixture, reportsService, root: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: { detectChanges: () => void }) {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function buttonWithText(root: HTMLElement, selector: string, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.includes(text))!;
}

function chartOptions(fixture: ReturnType<typeof setup>['fixture']): unknown[] {
  return fixture.debugElement.queryAll(By.directive(ChartStub)).map((d) => (d.componentInstance as ChartStub).option());
}

describe('ReportsPageComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 10));
  });
  afterEach(() => vi.useRealTimers());

  it('arranca con los últimos 30 días, todos los doctores, y pide también el período anterior', async () => {
    const { fixture, reportsService, root } = setup();
    await settle(fixture);

    const current = { from: '2026-09-06', to: '2026-10-05' };
    expect(reportsService.getOperational).toHaveBeenCalledWith(current);
    expect(reportsService.getFinancial).toHaveBeenCalledWith(current);
    expect(reportsService.getTrends).toHaveBeenCalledWith(current);
    expect(reportsService.getTopTreatments).toHaveBeenCalledWith(current, 8);
    expect(reportsService.getOperational).toHaveBeenCalledWith({ from: '2026-08-07', to: '2026-09-05' });
    expect(root.querySelector('.reports-page__preset[aria-pressed="true"]')?.textContent).toContain('30 días');
    expect(root.querySelector('.reports-page__period')?.textContent).toContain('30 días anteriores');
  });

  it('muestra los KPI con la variación contra el período anterior', async () => {
    const { fixture, root } = setup();
    await settle(fixture);

    const cards = Array.from(root.querySelectorAll('app-kpi-card')).map((c) => c.textContent ?? '');
    expect(cards).toHaveLength(6);
    expect(cards[0]).toContain('6');
    expect(cards[0]).toContain('+100%');
    expect(cards[1]).toContain('Bs. 1.550,00');
    expect(cards[2]).toContain('Saldo actual por cobrar');
    expect(cards[5]).toContain('-50%');
  });

  it('el operativo muestra los gráficos de citas, estados, ocupación y tratamientos', async () => {
    const { fixture, root } = setup();
    await settle(fixture);

    expect(chartOptions(fixture)).toHaveLength(4);
    expect(root.textContent).toContain('Citas por día');
    expect(root.textContent).toContain('Tratamientos más realizados');
  });

  it('la tabla por doctor separa las canceladas del total', async () => {
    const { fixture, root } = setup();
    await settle(fixture);

    const cells = Array.from(root.querySelectorAll('.reports-page__table tbody tr')[0].querySelectorAll('td')).map(
      (c) => c.textContent?.trim(),
    );
    // Confirmadas, En espera, Vencidas, Canceladas, No asistió (CLI-208), Total, Pacientes nuevos, Ocupación
    expect(cells.slice(0, 7)).toEqual(['3', '1', '2', '2', '0', '6', '4']);
    expect(cells[7]).toContain('30%');
  });

  it('lista las canceladas con cita, paciente, quién canceló y el motivo (CLI-103)', async () => {
    const { fixture, root } = setup();
    await settle(fixture);

    const table = root.querySelector('.reports-page__table--cancellations')!;
    expect(table.textContent).toContain('Ana Arce');
    expect(table.textContent).toContain('El paciente viaja');
    expect(table.textContent).toContain('Sin motivo');
  });

  it('la pestaña financiera muestra sus gráficos, la fila sin doctor y el total', async () => {
    const { fixture, root } = setup();
    await settle(fixture);

    buttonWithText(root, '.reports-page__tab', 'Financiero').click();
    await settle(fixture);

    expect(chartOptions(fixture)).toHaveLength(2);
    expect(root.textContent).toContain('Sin doctor asignado');
    expect(root.querySelector('tfoot')?.textContent).toContain('Bs. 1.550,00');
  });

  it('cambiar de rango rápido recarga con ese rango', async () => {
    const { fixture, reportsService, root } = setup();
    await settle(fixture);
    reportsService.getFinancial.mockClear();

    buttonWithText(root, '.reports-page__preset', 'Mes pasado').click();
    await settle(fixture);

    expect(reportsService.getFinancial).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('el rango personalizado muestra las fechas y no recarga si "Desde" queda después de "Hasta"', async () => {
    const { fixture, reportsService, root } = setup();
    await settle(fixture);

    buttonWithText(root, '.reports-page__preset', 'Personalizado').click();
    await settle(fixture);
    reportsService.getFinancial.mockClear();

    const from = root.querySelector<HTMLInputElement>('#reports-from')!;
    from.value = '2026-10-20';
    from.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(reportsService.getFinancial).not.toHaveBeenCalled();
    expect(root.textContent).toContain('tiene que ser anterior o igual');

    from.value = '2026-09-10';
    from.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(reportsService.getFinancial).toHaveBeenCalledWith({ from: '2026-09-10', to: '2026-10-05' });
  });

  it('filtra por doctor (también los dados de baja) y vuelve a "Todos"', async () => {
    const { fixture, reportsService, root } = setup();
    await settle(fixture);

    const select = root.querySelector<HTMLSelectElement>('#reports-doctor')!;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Todos los doctores',
      'Juan Perez',
      'Dra. Ana Arce (dado de baja)',
    ]);

    select.value = 'doctor-2';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(reportsService.getTrends).toHaveBeenLastCalledWith({ from: '2026-09-06', to: '2026-10-05', doctorId: 'doctor-2' });

    select.value = '';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(reportsService.getTrends).toHaveBeenLastCalledWith({ from: '2026-09-06', to: '2026-10-05' });
  });

  it('exporta la tabla por doctor a CSV con el rango en el nombre', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:csv');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { fixture, root } = setup();
    await settle(fixture);

    buttonWithText(root, '.reports-page__export', 'Exportar CSV').click();

    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('reporte-operativo_2026-09-06_a_2026-10-05.csv');
    const content = await (createObjectURL.mock.calls[0][0] as Blob).text();
    expect(content.replace('\uFEFF', '').split('\r\n')[1]).toBe('Juan Perez;3;1;2;2;0;6;4;30');
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('si falla la serie diaria, igual muestra KPIs y tablas', async () => {
    const { fixture, root } = setup({ trendsFails: true });
    await settle(fixture);

    expect(root.querySelectorAll('app-kpi-card')).toHaveLength(6);
    expect(root.textContent).toContain('No se pudo cargar la evolución del período.');
    expect(root.querySelector('.reports-page__table')).toBeTruthy();
  });

  it('sin tratamientos en el período lo dice en vez de un gráfico vacío', async () => {
    const { fixture, root } = setup({ treatments: [] });
    await settle(fixture);
    expect(root.textContent).toContain('No hay tratamientos registrados en el período.');
  });

  it('si falla el reporte principal muestra el error y permite reintentar', async () => {
    const { fixture, reportsService, root } = setup({ operationalFails: true });
    await settle(fixture);

    expect(root.querySelector('.reports-page__banner')?.textContent).toContain('No se pudieron cargar los reportes');
    reportsService.getOperational.mockClear();
    root.querySelector<HTMLButtonElement>('.reports-page__retry')!.click();
    await settle(fixture);
    expect(reportsService.getOperational).toHaveBeenCalled();
  });
});
