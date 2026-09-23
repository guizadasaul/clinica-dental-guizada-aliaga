import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ReportsService } from '../../services/reports.service';
import { BookingService } from '../../../booking/services/booking.service';
import { DoctorPickerComponent } from '../../../booking/components/doctor-picker/doctor-picker';
import type { Doctor } from '../../../booking/models/booking.model';
import type {
  DoctorOperationalRow,
  FinancialReport,
  OperationalReport,
} from '../../models/report.model';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

type ReportTab = 'operational' | 'financial';

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, DoctorPickerComponent, DecimalPipe],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPageComponent {
  private readonly reportsService = inject(ReportsService);
  private readonly bookingService = inject(BookingService);

  // Últimos 30 días por default — rango con actividad real en casi cualquier
  // momento, sin obligar al admin a elegir fechas antes de ver algo.
  protected readonly from = signal(daysAgoString(30));
  protected readonly to = signal(toDateString(new Date()));

  protected readonly doctors = signal<Doctor[]>([]);
  protected readonly doctorsLoading = signal(false);
  /** null = "todos los doctores" (sin filtro) — DoctorPickerComponent no tiene noción propia de "todos", la agrega esta página. */
  protected readonly selectedDoctorId = signal<string | null>(null);

  protected readonly tab = signal<ReportTab>('operational');

  protected readonly operationalReport = signal<OperationalReport | null>(null);
  protected readonly financialReport = signal<FinancialReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.loadDoctors();
    void this.loadReports();
  }

  private async loadDoctors(): Promise<void> {
    this.doctorsLoading.set(true);
    try {
      const result = await firstValueFrom(this.bookingService.getDoctors());
      this.doctors.set(result);
    } catch {
      this.doctors.set([]);
    } finally {
      this.doctorsLoading.set(false);
    }
  }

  protected setTab(tab: ReportTab): void {
    this.tab.set(tab);
  }

  protected selectDoctor(doctorId: string): void {
    this.selectedDoctorId.set(doctorId);
    void this.loadReports();
  }

  protected selectAllDoctors(): void {
    this.selectedDoctorId.set(null);
    void this.loadReports();
  }

  protected onFromInput(event: Event): void {
    this.from.set((event.target as HTMLInputElement).value);
  }

  protected onToInput(event: Event): void {
    this.to.set((event.target as HTMLInputElement).value);
  }

  protected async applyRange(): Promise<void> {
    await this.loadReports();
  }

  protected statusCount(row: DoctorOperationalRow, status: string): number {
    return row.appointmentsByStatus[status] ?? 0;
  }

  protected occupancyPercent(row: DoctorOperationalRow): number {
    return Math.round(row.occupancyRate * 100);
  }

  private async loadReports(): Promise<void> {
    const from = this.from();
    const to = this.to();
    if (!from || !to) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const doctorId = this.selectedDoctorId();
    const filters = { from, to, ...(doctorId && { doctorId }) };
    try {
      const [operational, financial] = await Promise.all([
        firstValueFrom(this.reportsService.getOperational(filters)),
        firstValueFrom(this.reportsService.getFinancial(filters)),
      ]);
      this.operationalReport.set(operational);
      this.financialReport.set(financial);
    } catch {
      this.error.set('No se pudieron cargar los reportes. Probá de nuevo.');
      this.operationalReport.set(null);
      this.financialReport.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
