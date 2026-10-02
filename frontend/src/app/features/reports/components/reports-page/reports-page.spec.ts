import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ReportsPageComponent } from './reports-page';
import { ReportsService } from '../../services/reports.service';
import { BookingService } from '../../../booking/services/booking.service';
import type { Doctor } from '../../../booking/models/booking.model';
import type { FinancialReport, OperationalReport } from '../../models/report.model';

const PICKER_DOCTOR: Doctor = {
  id: 'doctor-1',
  displayName: 'Juan Perez',
  specialty: 'Ortodoncia',
  bio: null,
  photoUrl: null,
  displayOrder: 0,
  isBookable: true,
  phone: null,
};

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

function setup(doctors: Doctor[] = [PICKER_DOCTOR], operationalFails = false) {
  // El constructor dispara loadReports() de entrada (misma llamada síncrona
  // que registra el mock), así que un mockReturnValue posterior a
  // TestBed.createComponent llegaría tarde — la primera llamada ya usó el
  // mock feliz. Por eso operationalFails se decide ANTES de crear el fixture.
  const reportsService = {
    getOperational: operationalFails
      ? vi.fn().mockReturnValue(throwError(() => new Error('boom')))
      : vi.fn().mockReturnValue(of(OPERATIONAL_REPORT)),
    getFinancial: vi.fn().mockReturnValue(of(FINANCIAL_REPORT)),
  };
  const bookingService = { getDoctors: vi.fn().mockReturnValue(of(doctors)) };
  TestBed.configureTestingModule({
    imports: [ReportsPageComponent],
    providers: [
      { provide: ReportsService, useValue: reportsService },
      { provide: BookingService, useValue: bookingService },
    ],
  });
  const fixture = TestBed.createComponent(ReportsPageComponent);
  return { fixture, reportsService, bookingService };
}

function el<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function allEls<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

// Cargar reportes es una cadena Promise.all(firstValueFrom, firstValueFrom)
// dentro de un signal — un solo settle() no alcanza a drenar ambos niveles
// de microtasks (mismo patrón que admin-doctors.spec.ts usa tras un submit
// que encadena dos pasos async).
async function settleAllLoads(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  await settle(fixture);
  await settle(fixture);
}

describe('ReportsPageComponent', () => {
  it('loads both reports for a default range without a doctor filter on init', async () => {
    const { fixture, reportsService } = setup();
    await settleAllLoads(fixture);

    expect(reportsService.getOperational).toHaveBeenCalledWith({
      from: expect.any(String) as string,
      to: expect.any(String) as string,
    });
    expect(reportsService.getFinancial).toHaveBeenCalledWith({
      from: expect.any(String) as string,
      to: expect.any(String) as string,
    });
  });

  it('renders the operational table by default', async () => {
    const { fixture } = setup();
    await settleAllLoads(fixture);

    const table = el(fixture, '.reports-page__table');
    expect(table.textContent).toContain('Juan Perez');
    expect(table.textContent).toContain('30%'); // ocupación
  });

  // CLI-154: las canceladas tienen columna propia y no suman al total.
  it('muestra las canceladas en su propia columna, fuera del total', async () => {
    const { fixture } = setup();
    await settleAllLoads(fixture);

    const table = el(fixture, '.reports-page__table');
    const headers = [...table.querySelectorAll('th')].map((th) => th.textContent?.trim());
    const cells = [...table.querySelectorAll('tbody tr td')].map((td) => td.textContent?.trim());
    const col = (name: string) => cells[headers.indexOf(name)];

    expect(col('Canceladas')).toBe('2');
    expect(col('Total turnos')).toBe('6');
    expect(fixture.nativeElement.textContent).toContain('no suman a "Total turnos"');
  });

  it('lista las canceladas con turno, paciente, quién canceló y el motivo (CLI-103)', async () => {
    const { fixture } = setup();
    await settleAllLoads(fixture);

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.reports-page__table--cancellations tbody tr')].map(
      (tr) => tr.textContent ?? '',
    );
    expect(rows).toHaveLength(2);
    // 10:00 en La Paz (UTC-4).
    expect(rows[0]).toContain('01/09/2026, 10:00');
    expect(rows[0]).toContain('Ana Arce');
    expect(rows[0]).toContain('31/08/2026, 16:30');
    expect(rows[0]).toContain('El paciente viaja');
    expect(rows[1]).toContain('Sin motivo');
  });

  it('sin canceladas en el rango lo dice en vez de mostrar una tabla vacía', async () => {
    const { fixture, reportsService } = setup();
    reportsService.getOperational.mockReturnValue(of({ ...OPERATIONAL_REPORT, cancellations: [] }));
    await settleAllLoads(fixture);
    // Fuerza una recarga con el mock nuevo.
    (fixture.componentInstance as unknown as { loadReports(): Promise<void> }).loadReports();
    await settleAllLoads(fixture);

    expect(fixture.nativeElement.textContent).toContain('No hay citas canceladas en el rango elegido');
  });

  it('switches to the financial tab and shows the unassigned-doctor row', async () => {
    const { fixture } = setup();
    await settleAllLoads(fixture);

    allEls<HTMLButtonElement>(fixture, '.reports-page__tab')[1].click();
    await settle(fixture);

    const table = el(fixture, '.reports-page__table');
    expect(table.textContent).toContain('1,500.00');
    expect(table.textContent).toContain('Sin doctor asignado');
  });

  it('selecting a doctor from the picker re-fetches both reports scoped to that doctor', async () => {
    const { fixture, reportsService } = setup();
    await settleAllLoads(fixture);
    reportsService.getOperational.mockClear();
    reportsService.getFinancial.mockClear();

    el<HTMLButtonElement>(fixture, '.doctor-picker__card').click();
    await settle(fixture);

    expect(reportsService.getOperational).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-1' }),
    );
    expect(reportsService.getFinancial).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-1' }),
    );
  });

  it('"Todos los doctores" clears a previously selected doctor filter', async () => {
    const { fixture, reportsService } = setup();
    await settleAllLoads(fixture);
    el<HTMLButtonElement>(fixture, '.doctor-picker__card').click();
    await settle(fixture);
    reportsService.getOperational.mockClear();

    el<HTMLButtonElement>(fixture, '.reports-page__chip').click();
    await settle(fixture);

    expect(reportsService.getOperational).toHaveBeenCalledWith({
      from: expect.any(String) as string,
      to: expect.any(String) as string,
    });
  });

  it('shows an error message when loading the reports fails', async () => {
    const { fixture } = setup([PICKER_DOCTOR], true);
    await settleAllLoads(fixture);

    expect(el(fixture, '.reports-page__banner--error')).toBeTruthy();
  });
});
