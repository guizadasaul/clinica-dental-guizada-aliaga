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
};

const OPERATIONAL_REPORT: OperationalReport = {
  from: '2026-08-17',
  to: '2026-09-16',
  doctors: [
    {
      doctorId: 'doctor-1',
      doctorName: 'Juan Perez',
      appointmentsByStatus: { confirmed: 3, held: 1, expired: 2 },
      totalAppointments: 6,
      newPatients: 4,
      theoreticalSlots: 10,
      confirmedAppointments: 3,
      occupancyRate: 0.3,
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
