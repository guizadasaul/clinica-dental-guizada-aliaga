import {
  appointmentsByDayOption,
  bucketTrendDays,
  CHART_STATUSES,
  collectedByDayOption,
  financialByDoctorOption,
  formatMoney,
  occupancyOption,
  statusDonutOption,
  statusTotals,
  topTreatmentsOption,
} from './report-charts';
import type { DoctorOperationalRow, TrendDay } from '../models/report.model';

type Series = { name?: string; data: unknown[]; itemStyle?: { color?: string } };
const seriesOf = (option: unknown) => (option as { series: Series[] }).series;
const categoriesOf = (option: unknown, axis: 'xAxis' | 'yAxis') =>
  (option as Record<string, { data: string[] }>)[axis].data;

function day(date: string, byStatus: Record<string, number> = {}, collected = 0): TrendDay {
  return { date, appointmentsByStatus: byStatus, collected };
}

function doctorRow(name: string, occupancyRate: number, byStatus: Record<string, number> = {}): DoctorOperationalRow {
  return {
    doctorId: name,
    doctorName: name,
    appointmentsByStatus: byStatus,
    totalAppointments: 0,
    newPatients: 0,
    theoreticalSlots: 10,
    confirmedAppointments: 0,
    occupancyRate,
  };
}

describe('bucketTrendDays', () => {
  it('en rangos cortos deja un bucket por día', () => {
    const buckets = bucketTrendDays([day('2026-09-01', { confirmed: 2 }, 50), day('2026-09-02')]);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ appointmentsByStatus: { confirmed: 2 }, collected: 50 });
    expect(buckets[0].label).toMatch(/^1 sep/);
  });

  it('en rangos largos agrupa por semana sumando estados y cobrado', () => {
    const days = Array.from({ length: 70 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10);
      return day(date, { confirmed: 1, cancelled: i % 7 === 0 ? 1 : 0 }, 10.1);
    });
    const buckets = bucketTrendDays(days);
    expect(buckets).toHaveLength(10);
    expect(buckets[0].label).toMatch(/^sem\. del 1 jul/);
    expect(buckets[0].appointmentsByStatus).toEqual({ confirmed: 7, cancelled: 1 });
    expect(buckets[0].collected).toBe(70.7);
  });
});

describe('opciones de los gráficos', () => {
  it('citas por día: una serie apilada por estado, con color fijo por estado', () => {
    const option = appointmentsByDayOption(bucketTrendDays([day('2026-09-01', { confirmed: 3, held: 1 })]));
    const series = seriesOf(option);
    expect(series.map((s) => s.name)).toEqual(['Confirmadas', 'En espera', 'Vencidas', 'Canceladas']);
    expect(series.map((s) => s.itemStyle?.color)).toEqual(CHART_STATUSES.map((s) => s.color));
    expect(series[0].data).toEqual([3]);
    expect(series[3].data).toEqual([0]);
  });

  it('anillo de estados: suma por estado y omite los que están en cero', () => {
    const totals = statusTotals([
      doctorRow('A', 0, { confirmed: 2, cancelled: 1 }),
      doctorRow('B', 0, { confirmed: 1 }),
    ]);
    expect(totals).toEqual({ confirmed: 3, held: 0, expired: 0, cancelled: 1 });
    const data = seriesOf(statusDonutOption(totals, 3))[0].data as { name: string; value: number }[];
    expect(data.map((d) => [d.name, d.value])).toEqual([
      ['Confirmadas', 3],
      ['Canceladas', 1],
    ]);
  });

  it('ocupación: porcentaje entero, con la mayor arriba (último de la categoría)', () => {
    const option = occupancyOption([doctorRow('Dra. Ana', 0.641), doctorRow('Dr. Beto', 0.48)]);
    expect(categoriesOf(option, 'yAxis')).toEqual(['Dr. Beto', 'Dra. Ana']);
    expect(seriesOf(option)[0].data).toEqual([48, 64]);
  });

  it('top tratamientos: ordenados por cantidad', () => {
    const option = topTreatmentsOption([
      { treatmentId: 't1', name: 'Resina', count: 3 },
      { treatmentId: 't2', name: 'Limpieza', count: 9 },
    ]);
    expect(categoriesOf(option, 'yAxis')).toEqual(['Resina', 'Limpieza']);
  });

  it('cobrado por día: una línea con el monto de cada bucket', () => {
    const option = collectedByDayOption(bucketTrendDays([day('2026-09-01', {}, 120), day('2026-09-02', {}, 0)]));
    expect(seriesOf(option)[0].data).toEqual([120, 0]);
  });

  it('cobrado y pendiente por doctor: dos series y "Sin doctor asignado" para el bucket sin doctor', () => {
    const option = financialByDoctorOption([
      { doctorId: 'd1', doctorName: 'Dr. Beto', collected: 500, pending: 100 },
      { doctorId: null, doctorName: null, collected: 50, pending: 0 },
    ]);
    expect(categoriesOf(option, 'yAxis')).toEqual(['Sin doctor asignado', 'Dr. Beto']);
    expect(seriesOf(option).map((s) => [s.name, s.data])).toEqual([
      ['Cobrado', [50, 500]],
      ['Pendiente', [0, 100]],
    ]);
  });

  it('formatMoney usa bolivianos con dos decimales', () => {
    expect(formatMoney(1500)).toBe('Bs. 1.500,00');
  });
});
