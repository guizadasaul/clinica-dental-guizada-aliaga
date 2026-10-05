import {
  buildKpis,
  lastDaysRange,
  localDateString,
  percentChange,
  previousRange,
  rangeLengthInDays,
} from './report-kpis';
import type { DoctorOperationalRow, FinancialReport, OperationalReport } from '../models/report.model';

function row(overrides: Partial<DoctorOperationalRow>): DoctorOperationalRow {
  return {
    doctorId: 'doctor-1',
    doctorName: 'Juan Perez',
    appointmentsByStatus: {},
    totalAppointments: 0,
    newPatients: 0,
    theoreticalSlots: 0,
    confirmedAppointments: 0,
    occupancyRate: 0,
    ...overrides,
  };
}

describe('buildKpis', () => {
  it('suma las filas de todos los doctores y calcula la ocupación global', () => {
    const operational: OperationalReport = {
      from: '2026-09-01',
      to: '2026-09-30',
      cancellations: [],
      doctors: [
        row({ appointmentsByStatus: { cancelled: 2 }, totalAppointments: 5, newPatients: 1, theoreticalSlots: 10, confirmedAppointments: 4 }),
        row({ doctorId: 'doctor-2', totalAppointments: 3, newPatients: 2, theoreticalSlots: 30, confirmedAppointments: 2 }),
      ],
    };
    const financial: FinancialReport = {
      from: '2026-09-01',
      to: '2026-09-30',
      doctors: [
        { doctorId: 'doctor-1', doctorName: 'Juan Perez', collected: 100.5, pending: 20 },
        { doctorId: null, doctorName: null, collected: 50, pending: 0 },
      ],
    };

    expect(buildKpis(operational, financial)).toEqual({
      appointments: 8,
      cancelled: 2,
      newPatients: 3,
      occupancyRate: 6 / 40,
      collected: 150.5,
      pending: 20,
    });
  });

  it('sin capacidad teórica la ocupación queda en null', () => {
    const kpis = buildKpis(
      { from: '2026-09-01', to: '2026-09-30', cancellations: [], doctors: [] },
      { from: '2026-09-01', to: '2026-09-30', doctors: [] },
    );
    expect(kpis.occupancyRate).toBeNull();
    expect(kpis.appointments).toBe(0);
  });
});

describe('percentChange', () => {
  it.each([
    [15, 10, 50],
    [5, 10, -50],
    [10, 10, 0],
    [1, 3, -67],
  ])('%d contra %d es %d%%', (current, previous, expected) => {
    expect(percentChange(current, previous)).toBe(expected);
  });

  it('sin base (período anterior en cero) no hay variación', () => {
    expect(percentChange(4, 0)).toBeNull();
  });
});

describe('rangos de fechas', () => {
  it('cuenta los días del rango con ambos extremos', () => {
    expect(rangeLengthInDays({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
    expect(rangeLengthInDays({ from: '2026-09-05', to: '2026-09-05' })).toBe(1);
  });

  it('el período anterior tiene el mismo largo y termina el día antes', () => {
    expect(previousRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-08-02',
      to: '2026-08-31',
    });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-07' })).toEqual({
      from: '2026-02-22',
      to: '2026-02-28',
    });
  });

  it('los últimos N días terminan hoy, en fecha local', () => {
    const lateNight = new Date(2026, 9, 5, 23, 30);
    expect(localDateString(lateNight)).toBe('2026-10-05');
    expect(lastDaysRange(30, lateNight)).toEqual({ from: '2026-09-06', to: '2026-10-05' });
  });
});
