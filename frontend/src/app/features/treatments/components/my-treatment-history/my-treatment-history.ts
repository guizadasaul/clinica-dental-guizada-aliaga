import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { TreatmentsService } from '../../services/treatments.service';
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
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface ApplicationView {
  id: string;
  treatmentName: string;
  categoryName: string;
  categoryColor: string;
  date: string;
  teeth: number[];
  scope: string | null;
  quantity: number | null;
  surfaces: string | null;
  notes: string | null;
  doctorName: string | null;
}

interface MonthGroup {
  label: string;
  items: ApplicationView[];
}

/**
 * Una aplicación por tarjeta: las filas de un mismo grupo multi-diente
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
        categoryColor: first.categoryColor,
        date: DATE_FORMATTER.format(new Date(first.procedureDate)),
        teeth,
        scope: teeth.length === 0 ? (SCOPE_LABELS[first.applicationType] ?? null) : null,
        quantity: isUnit ? first.quantity : null,
        surfaces: surfaces.length > 0 ? surfaces.join(', ') : null,
        notes: rows.find((r) => r.notes)?.notes ?? null,
        doctorName: first.performedByName,
      };
    })
    .sort((a, b) => b.iso.localeCompare(a.iso));
}

/**
 * "Mi historial" del paciente (CLI-211): todos los tratamientos que recibió,
 * con fecha, dientes, superficies, indicaciones del doctor y quién lo hizo.
 * El doctor sigue usando treatment-history (tabla con precios).
 */
@Component({
  selector: 'app-my-treatment-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  protected readonly lastDate = computed(() => this.applications()?.[0]?.date ?? null);

  /** Categorías presentes, en el orden en que aparecen, para los filtros. */
  protected readonly categories = computed(() => {
    const seen = new Map<string, string>();
    for (const a of this.applications() ?? []) {
      if (!seen.has(a.categoryName)) {
        seen.set(a.categoryName, a.categoryColor);
      }
    }
    return [...seen].map(([name, color]) => ({ name, color }));
  });

  protected readonly filter = signal<string | null>(null);

  protected readonly months = computed<MonthGroup[]>(() => {
    const selected = this.filter();
    const groups: MonthGroup[] = [];
    for (const app of this.applications() ?? []) {
      if (selected && app.categoryName !== selected) {
        continue;
      }
      const label = capitalize(MONTH_YEAR_FORMATTER.format(new Date(app.iso)));
      const last = groups.at(-1);
      if (last?.label === label) {
        last.items.push(app);
      } else {
        groups.push({ label, items: [app] });
      }
    }
    return groups;
  });

  protected toggle(category: string | null): void {
    this.filter.set(category);
  }
}
