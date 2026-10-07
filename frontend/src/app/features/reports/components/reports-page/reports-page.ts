import { Component, ChangeDetectionStrategy, computed, inject, signal, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReportsService } from '../../services/reports.service';
import { AdminDoctorsService } from '../../../admin/services/admin-doctors.service';
import type { AdminDoctorSummary } from '../../../admin/models/admin-doctor.model';
import type {
  CancelledAppointmentRow,
  DoctorFinancialRow,
  DoctorOperationalRow,
  FinancialReport,
  OperationalReport,
  TopTreatmentRow,
  TrendsReport,
} from '../../models/report.model';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { ChartComponent } from '../../../../shared/ui/chart/chart';
import { KpiCardComponent } from '../kpi-card/kpi-card';
import {
  buildKpis,
  percentChange,
  previousRange,
  rangeLengthInDays,
  type DateRange,
  type ReportKpis,
} from '../../utils/report-kpis';
import { formatRange, presetRange, RANGE_PRESETS, type RangePreset } from '../../utils/report-ranges';
import {
  appointmentsByDayOption,
  bucketTrendDays,
  collectedByDayOption,
  financialByDoctorOption,
  formatMoney,
  occupancyOption,
  statusDonutOption,
  statusTotals,
  topTreatmentsOption,
  CHART_STATUSES,
} from '../../utils/report-charts';
import { downloadCsv, toCsv, type CsvColumn } from '../../utils/csv';

type ReportTab = 'operational' | 'financial';

const TOP_TREATMENTS_LIMIT = 8;
const COUNT = new Intl.NumberFormat('es-BO');

/** Fecha y hora en el huso de la clínica, para la lista de canceladas (CLI-103). */
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDateTime(iso: string): string {
  return DATE_TIME_FORMATTER.format(new Date(iso));
}

function barChartHeight(rows: number, perRow: number): number {
  return Math.max(160, rows * perRow + 32);
}

function statusCount(row: DoctorOperationalRow, status: string): number {
  return row.appointmentsByStatus[status] ?? 0;
}

const DOCTOR_COLUMNS: CsvColumn<DoctorOperationalRow>[] = [
  { header: 'Doctor', value: (r) => r.doctorName ?? 'Sin nombre' },
  ...CHART_STATUSES.map((s) => ({ header: s.label, value: (r: DoctorOperationalRow) => statusCount(r, s.key) })),
  { header: 'Total citas', value: (r) => r.totalAppointments },
  { header: 'Pacientes nuevos', value: (r) => r.newPatients },
  { header: 'Ocupación (%)', value: (r) => Math.round(r.occupancyRate * 100) },
];

const CANCELLATION_COLUMNS: CsvColumn<CancelledAppointmentRow>[] = [
  { header: 'Cita', value: (c) => formatDateTime(c.appointmentDatetime) },
  { header: 'Paciente', value: (c) => c.patientName ?? 'Sin nombre' },
  { header: 'Doctor', value: (c) => c.doctorName ?? 'Sin nombre' },
  { header: 'Cancelada el', value: (c) => (c.cancelledAt ? formatDateTime(c.cancelledAt) : null) },
  { header: 'Cancelada por', value: (c) => c.cancelledByName },
  { header: 'Motivo', value: (c) => c.cancelReason },
];

const FINANCIAL_COLUMNS: CsvColumn<DoctorFinancialRow>[] = [
  { header: 'Doctor', value: (r) => r.doctorName ?? 'Sin doctor asignado' },
  { header: 'Cobrado en el período (Bs.)', value: (r) => r.collected },
  { header: 'Pendiente actual (Bs.)', value: (r) => r.pending },
];

/**
 * Reportes del administrador (CLI-199): filtros con rangos rápidos, KPIs con
 * variación contra el período anterior, gráficos con ECharts y tablas
 * exportables a CSV.
 */
@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, ChartComponent, KpiCardComponent],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPageComponent implements OnInit {
  private readonly reportsService = inject(ReportsService);
  private readonly adminDoctorsService = inject(AdminDoctorsService);

  protected readonly presets = RANGE_PRESETS;
  protected readonly statuses = CHART_STATUSES;

  protected readonly preset = signal<RangePreset>('30d');
  /** Rango elegido a mano: arranca en los últimos 30 días para no abrir vacío. */
  protected readonly customRange = signal<DateRange>(presetRange('30d'));
  protected readonly customError = signal<string | null>(null);

  protected readonly range = computed<DateRange>(() => {
    const preset = this.preset();
    return preset === 'custom' ? this.customRange() : presetRange(preset);
  });
  protected readonly rangeLabel = computed(() => formatRange(this.range()));
  protected readonly rangeDays = computed(() => rangeLengthInDays(this.range()));

  protected readonly doctors = signal<AdminDoctorSummary[]>([]);
  /** null = todos los doctores. */
  protected readonly selectedDoctorId = signal<string | null>(null);

  protected readonly tab = signal<ReportTab>('operational');

  protected readonly operationalReport = signal<OperationalReport | null>(null);
  protected readonly financialReport = signal<FinancialReport | null>(null);
  protected readonly previousKpis = signal<ReportKpis | null>(null);
  /** null también si la serie falló: los KPIs y tablas se muestran igual. */
  protected readonly trends = signal<TrendsReport | null>(null);
  protected readonly topTreatments = signal<TopTreatmentRow[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private requestId = 0;

  protected readonly kpis = computed(() => {
    const operational = this.operationalReport();
    const financial = this.financialReport();
    return operational && financial ? buildKpis(operational, financial) : null;
  });

  protected readonly doctorRows = computed(() => this.operationalReport()?.doctors ?? []);
  protected readonly cancellations = computed(() => this.operationalReport()?.cancellations ?? []);
  protected readonly financialRows = computed(() => this.financialReport()?.doctors ?? []);

  protected readonly totals = computed(() => statusTotals(this.doctorRows()));
  protected readonly hasAppointments = computed(() => Object.values(this.totals()).some((n) => n > 0));

  private readonly buckets = computed(() => bucketTrendDays(this.trends()?.days ?? []));
  protected readonly weekly = computed(() => (this.trends()?.days.length ?? 0) !== this.buckets().length);

  protected readonly appointmentsByDay = computed(() => appointmentsByDayOption(this.buckets()));
  protected readonly statusDonut = computed(() => statusDonutOption(this.totals(), this.kpis()?.appointments ?? 0));
  protected readonly occupancy = computed(() => occupancyOption(this.doctorRows()));
  protected readonly topTreatmentsChart = computed(() => topTreatmentsOption(this.topTreatments() ?? []));
  protected readonly collectedByDay = computed(() => collectedByDayOption(this.buckets()));
  protected readonly hasCollected = computed(() => (this.kpis()?.collected ?? 0) > 0);
  protected readonly financialByDoctor = computed(() => financialByDoctorOption(this.financialRows()));
  protected readonly hasFinancialRows = computed(() =>
    this.financialRows().some((r) => r.collected > 0 || r.pending > 0),
  );
  protected readonly financialTotals = computed(() =>
    this.financialRows().reduce(
      (acc, r) => ({ collected: acc.collected + r.collected, pending: acc.pending + r.pending }),
      { collected: 0, pending: 0 },
    ),
  );

  /** Variación de cada KPI contra el período anterior (null = sin base para comparar). */
  protected readonly deltas = computed(() => {
    const current = this.kpis();
    const previous = this.previousKpis();
    const delta = (pick: (k: ReportKpis) => number | null): number | null => {
      if (!current || !previous) {
        return null;
      }
      const now = pick(current);
      const before = pick(previous);
      return now === null || before === null ? null : percentChange(now, before);
    };
    return {
      appointments: delta((k) => k.appointments),
      collected: delta((k) => k.collected),
      occupancyRate: delta((k) => k.occupancyRate),
      newPatients: delta((k) => k.newPatients),
      cancelled: delta((k) => k.cancelled),
    };
  });

  // Las barras horizontales crecen con la cantidad de filas para no apretarse.
  protected readonly occupancyHeight = computed(() => barChartHeight(this.doctorRows().length, 44));
  protected readonly topTreatmentsHeight = computed(() => barChartHeight(this.topTreatments()?.length ?? 0, 36));
  protected readonly financialHeight = computed(() => barChartHeight(this.financialRows().length, 56));

  protected readonly skeletons = [0, 1, 2, 3, 4, 5];

  ngOnInit(): void {
    void this.loadDoctors();
    void this.loadReports();
  }

  private async loadDoctors(): Promise<void> {
    try {
      this.doctors.set(await firstValueFrom(this.adminDoctorsService.getAll()));
    } catch {
      this.doctors.set([]);
    }
  }

  protected selectPreset(preset: RangePreset): void {
    if (preset === this.preset()) {
      return;
    }
    this.preset.set(preset);
    this.customError.set(null);
    void this.loadReports();
  }

  protected onCustomDate(edge: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) {
      return;
    }
    const next = { ...this.customRange(), [edge]: value };
    this.customRange.set(next);
    if (next.from > next.to) {
      this.customError.set('La fecha "Desde" tiene que ser anterior o igual a "Hasta".');
      return;
    }
    this.customError.set(null);
    void this.loadReports();
  }

  protected onDoctorChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedDoctorId.set(value || null);
    void this.loadReports();
  }

  protected setTab(tab: ReportTab): void {
    this.tab.set(tab);
  }

  protected retry(): void {
    void this.loadReports();
  }

  protected async loadReports(): Promise<void> {
    const requestId = ++this.requestId;
    const range = this.range();
    const doctorId = this.selectedDoctorId();
    const filters = { ...range, ...(doctorId && { doctorId }) };
    const previousFilters = { ...previousRange(range), ...(doctorId && { doctorId }) };

    this.loading.set(true);
    this.error.set(null);
    try {
      // La serie, el top de tratamientos y el período anterior son
      // complementarios: si fallan, la página se muestra igual sin ellos.
      const [operational, financial, trends, top, previous] = await Promise.all([
        firstValueFrom(this.reportsService.getOperational(filters)),
        firstValueFrom(this.reportsService.getFinancial(filters)),
        firstValueFrom(this.reportsService.getTrends(filters)).catch(() => null),
        firstValueFrom(this.reportsService.getTopTreatments(filters, TOP_TREATMENTS_LIMIT)).catch(() => null),
        Promise.all([
          firstValueFrom(this.reportsService.getOperational(previousFilters)),
          firstValueFrom(this.reportsService.getFinancial(previousFilters)),
        ]).catch(() => null),
      ]);
      if (requestId !== this.requestId) {
        return; // Llegó tarde: el admin ya cambió de filtro.
      }
      this.operationalReport.set(operational);
      this.financialReport.set(financial);
      this.trends.set(trends);
      this.topTreatments.set(top?.treatments ?? null);
      this.previousKpis.set(previous ? buildKpis(previous[0], previous[1]) : null);
    } catch {
      if (requestId !== this.requestId) {
        return;
      }
      this.error.set('No se pudieron cargar los reportes. Revisa tu conexión e intenta de nuevo.');
      this.operationalReport.set(null);
      this.financialReport.set(null);
    } finally {
      if (requestId === this.requestId) {
        this.loading.set(false);
      }
    }
  }

  protected formatCount(value: number): string {
    return COUNT.format(value);
  }

  protected formatMoney(value: number): string {
    return formatMoney(value);
  }

  protected formatPercent(rate: number | null): string {
    return rate === null ? '—' : `${Math.round(rate * 100)}%`;
  }

  protected formatDateTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected statusCount(row: DoctorOperationalRow, status: string): number {
    return statusCount(row, status);
  }

  protected occupancyPercent(row: DoctorOperationalRow): number {
    return Math.round(row.occupancyRate * 100);
  }

  protected doctorLabel(doctor: AdminDoctorSummary): string {
    const name = doctor.displayName ?? 'Sin nombre';
    return doctor.isActive ? name : `${name} (dado de baja)`;
  }

  protected exportDoctors(): void {
    this.export('reporte-operativo', toCsv(this.doctorRows(), DOCTOR_COLUMNS));
  }

  protected exportCancellations(): void {
    this.export('citas-canceladas', toCsv(this.cancellations(), CANCELLATION_COLUMNS));
  }

  protected exportFinancial(): void {
    this.export('reporte-financiero', toCsv(this.financialRows(), FINANCIAL_COLUMNS));
  }

  private export(name: string, csv: string): void {
    const { from, to } = this.range();
    downloadCsv(`${name}_${from}_a_${to}.csv`, csv);
  }
}
