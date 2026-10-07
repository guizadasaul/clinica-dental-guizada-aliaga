import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  OnInit,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { LogoComponent } from '../../../../shared/ui/logo/logo';
import { AdminDoctorsComponent } from '../../../admin/components/admin-doctors/admin-doctors';
import { ReportsPageComponent } from '../../../reports/components/reports-page/reports-page';
import { TestimonialReviewComponent } from '../../../testimonials/components/testimonial-review/testimonial-review';
import { KpiCardComponent } from '../../../reports/components/kpi-card/kpi-card';
import { ReportsService } from '../../../reports/services/reports.service';
import {
  buildKpis,
  lastDaysRange,
  percentChange,
  previousRange,
  type DateRange,
  type ReportKpis,
} from '../../../reports/utils/report-kpis';

/** Ventana de los reportes rápidos del inicio (CLI-197). */
const QUICK_REPORT_DAYS = 30;

const COUNT_FORMATTER = new Intl.NumberFormat('es-BO');
const MONEY_FORMATTER = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LogoComponent,
    AdminDoctorsComponent,
    ReportsPageComponent,
    TestimonialReviewComponent,
    KpiCardComponent,
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly reportsService = inject(ReportsService);

  readonly activeNav = input<string>('home');
  readonly navChange = output<string>();

  protected readonly user = this.authService.currentUser;

  protected readonly firstName = computed(() => {
    const name = this.user()?.displayName;
    return name ? name.split(' ')[0] : 'Administrador';
  });

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) { return 'Buenos días'; }
    if (hour < 19) { return 'Buenas tardes'; }
    return 'Buenas noches';
  });

  protected readonly today = computed(() =>
    new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );

  protected readonly kpis = signal<ReportKpis | null>(null);
  protected readonly previousKpis = signal<ReportKpis | null>(null);
  protected readonly kpisLoading = signal(false);
  protected readonly kpisError = signal<string | null>(null);
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];

  ngOnInit(): void {
    void this.loadKpis();
  }

  protected async loadKpis(): Promise<void> {
    const current = lastDaysRange(QUICK_REPORT_DAYS);
    const previous = previousRange(current);
    this.kpisLoading.set(true);
    this.kpisError.set(null);
    try {
      const [currentKpis, previousKpis] = await Promise.all([
        this.fetchKpis(current),
        // Sin el período anterior igual se muestran los valores, solo sin variación.
        this.fetchKpis(previous).catch(() => null),
      ]);
      this.kpis.set(currentKpis);
      this.previousKpis.set(previousKpis);
    } catch {
      this.kpisError.set('No se pudieron cargar los reportes rápidos.');
    } finally {
      this.kpisLoading.set(false);
    }
  }

  private async fetchKpis(range: DateRange): Promise<ReportKpis> {
    const [operational, financial] = await Promise.all([
      firstValueFrom(this.reportsService.getOperational(range)),
      firstValueFrom(this.reportsService.getFinancial(range)),
    ]);
    return buildKpis(operational, financial);
  }

  protected change(current: number, previous: number): number | null {
    return percentChange(current, previous);
  }

  protected occupancyChange(current: number | null, previous: number | null): number | null {
    return current === null || previous === null ? null : percentChange(current, previous);
  }

  protected formatCount(value: number): string {
    return COUNT_FORMATTER.format(value);
  }

  protected formatMoney(value: number): string {
    return `Bs. ${MONEY_FORMATTER.format(value)}`;
  }

  protected formatPercent(rate: number | null): string {
    return rate === null ? '—' : `${Math.round(rate * 100)}%`;
  }

  protected onGoTo(key: string): void {
    this.navChange.emit(key);
  }
}
