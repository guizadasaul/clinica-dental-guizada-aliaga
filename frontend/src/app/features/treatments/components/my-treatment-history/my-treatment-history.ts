import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { TreatmentsService } from '../../services/treatments.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import { PaginationComponent, PAGE_SIZE } from '../../../../shared/ui/pagination/pagination';
import { clampPage, pageSlice } from '../../../../shared/utils/pagination.util';
import type {
  ToothProcedure,
  ToothSurfaceCode,
  TreatmentApplicationType,
} from '../../models/treatment.model';

const SURFACE_NAMES: Record<ToothSurfaceCode, string> = {
  vestibular: 'Vestibular',
  palatal: 'Palatina',
  lingual: 'Lingual',
  mesial: 'Mesial',
  distal: 'Distal',
  occlusal: 'Oclusal',
  incisal: 'Incisal',
};

/** Alcance de los tratamientos que no van sobre un diente puntual. */
const SCOPE_LABELS: Partial<Record<TreatmentApplicationType, string>> = {
  upper_arch: 'Arcada superior',
  lower_arch: 'Arcada inferior',
  full_mouth: 'Boca completa',
  soft_tissue: 'Tejidos blandos',
  frenulum: 'Frenillo',
  orthodontic: 'Ortodoncia',
  prosthesis: 'Prótesis',
};

// procedure_date es una fecha sin hora (medianoche UTC): se formatea en UTC
// para no correrla un día hacia atrás en Bolivia.
const DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface ApplicationView {
  id: string;
  treatmentName: string;
  categoryName: string;
  date: string;
  /** Dónde se aplicó y quién lo hizo: "Piezas 16, 17 · Oclusal · Dra. Lucía Mamani". */
  meta: string;
  notes: string | null;
}

function whereLabel(
  teeth: number[],
  surfaces: string[],
  quantity: number | null,
  type: TreatmentApplicationType,
): string | null {
  const parts: string[] = [];
  if (teeth.length > 0) {
    parts.push(`${teeth.length === 1 ? 'Pieza' : 'Piezas'} ${teeth.join(', ')}`);
  } else if (SCOPE_LABELS[type]) {
    parts.push(SCOPE_LABELS[type]);
  }
  if (surfaces.length > 0) {
    parts.push(surfaces.join(', '));
  }
  if (quantity !== null) {
    parts.push(`${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Una aplicación por fila: las filas de un mismo grupo multi-diente
 * (applicationGroupId) se juntan, igual que en la vista del doctor.
 */
function toApplications(procedures: ToothProcedure[]): (ApplicationView & { iso: string })[] {
  const byKey = new Map<string, ToothProcedure[]>();
  for (const p of procedures) {
    const key = p.applicationGroupId ?? p.id;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  return [...byKey.values()]
    .map((rows) => {
      const first = rows[0];
      const teeth = rows
        .map((r) => r.toothNumber)
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      const surfaces = [...new Set(rows.flatMap((r) => r.surfaces))].map((c) => SURFACE_NAMES[c]);
      const isUnit = first.applicationType === 'unit' || first.applicationType === 'box';
      return {
        id: first.applicationGroupId ?? first.id,
        iso: first.procedureDate,
        treatmentName: first.treatmentName,
        categoryName: first.categoryName,
        date: DATE_FORMATTER.format(new Date(first.procedureDate)),
        meta: [
          whereLabel(teeth, surfaces, isUnit ? first.quantity : null, first.applicationType),
          first.performedByName,
        ]
          .filter(Boolean)
          .join(' · '),
        notes: rows.find((r) => r.notes)?.notes ?? null,
      };
    })
    .sort((a, b) => b.iso.localeCompare(a.iso));
}

/**
 * "Mi historial" del paciente (CLI-211, reestilo CLI-216): todos los
 * tratamientos que recibió, del más reciente al más antiguo, con fecha,
 * piezas, superficies, indicaciones del doctor y quién lo hizo.
 * El doctor sigue usando treatment-history (tabla con precios).
 */
@Component({
  selector: 'app-my-treatment-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PaginationComponent],
  templateUrl: './my-treatment-history.html',
  styleUrl: './my-treatment-history.scss',
})
export class MyTreatmentHistoryComponent {
  private readonly treatmentsService = inject(TreatmentsService);

  /** undefined mientras carga; null si falló. */
  private readonly applications = toSignal(
    this.treatmentsService.getMyToothProcedures().pipe(
      map(toApplications),
      catchError(() => of(null)),
    ),
  );

  protected readonly loading = computed(() => this.applications() === undefined);
  protected readonly failed = computed(() => this.applications() === null);
  protected readonly total = computed(() => this.applications()?.length ?? 0);

  /** Tipos presentes, en el orden en que aparecen, para el filtro. */
  protected readonly categories = computed(() => [
    ...new Set((this.applications() ?? []).map((a) => a.categoryName)),
  ]);

  protected readonly filter = signal<string | null>(null);

  protected readonly filtered = computed(() => {
    const selected = this.filter();
    const all = this.applications() ?? [];
    return selected ? all.filter((a) => a.categoryName === selected) : all;
  });

  // CLI-216: de a 10 tratamientos, como las listas del panel del doctor.
  private readonly requestedPage = signal(1);
  protected readonly currentPage = computed(() =>
    clampPage(this.requestedPage(), this.filtered().length, PAGE_SIZE),
  );
  protected readonly visible = computed(() =>
    pageSlice(this.filtered(), this.currentPage(), PAGE_SIZE),
  );

  protected onFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filter.set(value || null);
    this.requestedPage.set(1);
  }

  protected goToPage(page: number): void {
    this.requestedPage.set(page);
  }
}
