import type { EChartsCoreOption } from 'echarts/core';
import {
  AXIS_BASE,
  CHART_COLORS,
  CHART_FONT,
  TOOLTIP_BASE,
  VALUE_LABEL,
} from '../../../shared/ui/chart/chart-theme';
import type {
  AppointmentStatusCounts,
  DoctorFinancialRow,
  DoctorOperationalRow,
  TopTreatmentRow,
  TrendDay,
} from '../models/report.model';

/**
 * Estados que se grafican, en orden de apilado. El color sigue al estado
 * (nunca a su posición), así que filtrar un doctor no repinta nada.
 * 'attended' queda afuera: ningún flujo lo puebla (ver report.model.ts).
 */
export const CHART_STATUSES = [
  { key: 'confirmed', label: 'Confirmadas', color: CHART_COLORS.series1 },
  { key: 'held', label: 'En espera', color: CHART_COLORS.series2 },
  { key: 'expired', label: 'Vencidas', color: CHART_COLORS.series3 },
  { key: 'cancelled', label: 'Canceladas', color: CHART_COLORS.series4 },
  { key: 'no_show', label: 'No asistió', color: CHART_COLORS.series5 },
] as const;

/** Más de esto en barras diarias ya no se lee: se agrupa por semana. */
const MAX_DAILY_BUCKETS = 62;

const DAY_LABEL = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const MONEY = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: number): string {
  return `Bs. ${MONEY.format(value)}`;
}

export interface TrendBucket {
  label: string;
  appointmentsByStatus: AppointmentStatusCounts;
  collected: number;
}

/** Días tal cual, o semanas ("sem. del 6 sept") si el rango es largo. */
export function bucketTrendDays(days: readonly TrendDay[]): TrendBucket[] {
  const label = (date: string) => DAY_LABEL.format(new Date(`${date}T00:00:00Z`));
  if (days.length <= MAX_DAILY_BUCKETS) {
    return days.map((d) => ({ label: label(d.date), appointmentsByStatus: d.appointmentsByStatus, collected: d.collected }));
  }
  const buckets: TrendBucket[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const appointmentsByStatus: AppointmentStatusCounts = {};
    for (const day of week) {
      for (const [status, count] of Object.entries(day.appointmentsByStatus)) {
        appointmentsByStatus[status] = (appointmentsByStatus[status] ?? 0) + count;
      }
    }
    buckets.push({
      label: `sem. del ${label(week[0].date)}`,
      appointmentsByStatus,
      collected: Math.round(week.reduce((sum, d) => sum + d.collected, 0) * 100) / 100,
    });
  }
  return buckets;
}

export function statusTotals(rows: readonly DoctorOperationalRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const status of CHART_STATUSES) {
    totals[status.key] = rows.reduce((sum, r) => sum + (r.appointmentsByStatus[status.key] ?? 0), 0);
  }
  return totals;
}

const SHADOW_POINTER = { type: 'shadow', shadowStyle: { color: 'rgba(0, 0, 0, 0.04)' } };

export function appointmentsByDayOption(buckets: readonly TrendBucket[]): EChartsCoreOption {
  return {
    animationDuration: 300,
    grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
    tooltip: { ...TOOLTIP_BASE, trigger: 'axis', axisPointer: SHADOW_POINTER },
    xAxis: { type: 'category', data: buckets.map((b) => b.label), ...AXIS_BASE, splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...AXIS_BASE, axisLine: { show: false } },
    series: CHART_STATUSES.map((status, i) => ({
      name: status.label,
      type: 'bar',
      stack: 'citas',
      barMaxWidth: 18,
      data: buckets.map((b) => b.appointmentsByStatus[status.key] ?? 0),
      // Borde del color de la superficie = separación de 1px entre segmentos.
      itemStyle: {
        color: status.color,
        borderColor: CHART_COLORS.surface,
        borderWidth: 1,
        borderRadius: i === CHART_STATUSES.length - 1 ? [4, 4, 0, 0] : 0,
      },
      emphasis: { focus: 'series' },
    })),
  };
}

export function statusDonutOption(totals: Record<string, number>, appointments: number): EChartsCoreOption {
  return {
    animationDuration: 300,
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'item',
      formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: <b>${p.value}</b> (${p.percent}%)`,
    },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: CHART_COLORS.inkMuted, fontFamily: CHART_FONT },
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        padAngle: 1,
        itemStyle: { borderColor: CHART_COLORS.surface, borderWidth: 2, borderRadius: 4 },
        label: {
          show: true,
          position: 'center',
          formatter: `{value|${appointments}}\n{caption|citas}`,
          rich: {
            value: { fontSize: 26, fontFamily: "'Libre Caslon Text', Georgia, serif", color: CHART_COLORS.ink },
            caption: { fontSize: 12, fontFamily: CHART_FONT, color: CHART_COLORS.inkMuted, padding: [4, 0, 0, 0] },
          },
        },
        emphasis: { scale: false },
        data: CHART_STATUSES.filter((s) => (totals[s.key] ?? 0) > 0).map((s) => ({
          name: s.label,
          value: totals[s.key],
          itemStyle: { color: s.color },
        })),
      },
    ],
  };
}

/** Barras horizontales de una sola serie; las categorías van de mayor a menor (arriba la mayor). */
function horizontalBarOption(
  rows: readonly { label: string; value: number }[],
  valueText: (value: number) => string,
  axisMax?: number,
): EChartsCoreOption {
  const ordered = [...rows].sort((a, b) => a.value - b.value);
  return {
    animationDuration: 300,
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'item',
      formatter: (p: { name: string; value: number }) => `${p.name}: <b>${valueText(p.value)}</b>`,
    },
    xAxis: { type: 'value', minInterval: 1, ...(axisMax !== undefined && { max: axisMax }), ...AXIS_BASE, axisLabel: { show: false } },
    yAxis: { type: 'category', data: ordered.map((r) => r.label), ...AXIS_BASE, splitLine: { show: false } },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        data: ordered.map((r) => r.value),
        itemStyle: { color: CHART_COLORS.series1, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', ...VALUE_LABEL, formatter: (p: { value: number }) => valueText(p.value) },
      },
    ],
  };
}

export function occupancyOption(rows: readonly DoctorOperationalRow[]): EChartsCoreOption {
  return horizontalBarOption(
    rows.map((r) => ({ label: r.doctorName ?? 'Sin nombre', value: Math.round(r.occupancyRate * 100) })),
    (v) => `${v}%`,
    100,
  );
}

export function topTreatmentsOption(rows: readonly TopTreatmentRow[]): EChartsCoreOption {
  return horizontalBarOption(
    rows.map((r) => ({ label: r.name, value: r.count })),
    (v) => `${v} ${v === 1 ? 'pieza' : 'piezas'}`,
  );
}

export function collectedByDayOption(buckets: readonly TrendBucket[]): EChartsCoreOption {
  return {
    animationDuration: 300,
    grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP_BASE,
      trigger: 'axis',
      valueFormatter: (v: number) => formatMoney(v),
      axisPointer: { lineStyle: { color: CHART_COLORS.inkMuted } },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      boundaryGap: false,
      ...AXIS_BASE,
      splitLine: { show: false },
    },
    yAxis: { type: 'value', ...AXIS_BASE, axisLine: { show: false } },
    series: [
      {
        name: 'Cobrado',
        type: 'line',
        // Sin suavizado: con días sin pagos, la curva inventa picos y valles.
        smooth: false,
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: false,
        data: buckets.map((b) => b.collected),
        lineStyle: { color: CHART_COLORS.series1, width: 2 },
        itemStyle: { color: CHART_COLORS.series1, borderColor: CHART_COLORS.surface, borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 138, 161, 0.22)' },
              { offset: 1, color: 'rgba(0, 138, 161, 0)' },
            ],
          },
        },
      },
    ],
  };
}

export function financialByDoctorOption(rows: readonly DoctorFinancialRow[]): EChartsCoreOption {
  const ordered = [...rows].sort((a, b) => a.collected + a.pending - (b.collected + b.pending));
  const series = [
    { name: 'Cobrado', color: CHART_COLORS.series1, pick: (r: DoctorFinancialRow) => r.collected },
    { name: 'Pendiente', color: CHART_COLORS.series2, pick: (r: DoctorFinancialRow) => r.pending },
  ];
  return {
    animationDuration: 300,
    grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...TOOLTIP_BASE, trigger: 'axis', axisPointer: SHADOW_POINTER, valueFormatter: (v: number) => formatMoney(v) },
    xAxis: { type: 'value', ...AXIS_BASE },
    yAxis: {
      type: 'category',
      data: ordered.map((r) => r.doctorName ?? 'Sin doctor asignado'),
      ...AXIS_BASE,
      splitLine: { show: false },
    },
    series: series.map((s) => ({
      name: s.name,
      type: 'bar',
      barWidth: 12,
      barGap: '30%',
      data: ordered.map(s.pick),
      itemStyle: { color: s.color, borderRadius: [0, 4, 4, 0] },
    })),
  };
}
