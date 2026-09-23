import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { TreatmentsService } from '../../services/treatments.service';
import type { Treatment, ToothProcedure, ToothSurfaceCode } from '../../models/treatment.model';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

const SURFACE_ABBREVIATIONS: Record<ToothSurfaceCode, string> = {
  vestibular: 'Vest.',
  palatal: 'Pal.',
  lingual: 'Ling.',
  mesial: 'Mes.',
  distal: 'Dis.',
  occlusal: 'Ocl.',
  incisal: 'Inc.',
};

interface GroupedProcedure {
  readonly key: string;
  readonly procedureDate: string;
  readonly toothNumbers: number[];
  readonly treatmentId: string;
  readonly totalPrice: number;
  readonly surfaces: string;
  readonly notes: string | null;
}

@Component({
  selector: 'app-treatment-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, DecimalPipe],
  templateUrl: './treatment-history.html',
  styleUrl: './treatment-history.scss',
})
export class TreatmentHistoryComponent {
  private readonly treatmentsService = inject(TreatmentsService);

  readonly patientId = input.required<string>();
  readonly close = output<void>();

  protected readonly treatments = toSignal(
    this.treatmentsService.getAll(),
    { initialValue: [] as Treatment[] },
  );

  protected readonly procedures = signal<ToothProcedure[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly total = computed(() =>
    this.procedures().reduce((sum, p) => sum + p.priceCharged, 0),
  );

  /**
   * Colapsa las filas de una misma aplicación multi_tooth (comparten
   * applicationGroupId) en una sola fila — el precio ya está completo en
   * la fila del diente más bajo del grupo y en 0 en las demás (ver CLI-15),
   * así que sumar priceCharged del grupo sigue dando el precio real.
   */
  protected readonly groupedProcedures = computed<GroupedProcedure[]>(() => {
    const groups = new Map<string, ToothProcedure[]>();
    const order: string[] = [];
    for (const p of this.procedures()) {
      const key = p.applicationGroupId ?? p.id;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(p);
    }
    return order.map((key) => {
      const rows = groups.get(key)!;
      const first = rows[0];
      return {
        key,
        procedureDate: first.procedureDate,
        toothNumbers: rows
          .map((r) => r.toothNumber)
          .filter((n): n is number => n !== null),
        treatmentId: first.treatmentId,
        totalPrice: rows.reduce((sum, r) => sum + r.priceCharged, 0),
        surfaces: rows.length === 1 ? this.getSurfaces(rows[0]) : '—',
        notes: first.notes,
      };
    });
  });

  constructor() {
    effect(() => {
      const id = this.patientId();
      if (!id) { return; }
      this.loading.set(true);
      this.loadError.set(false);
      this.treatmentsService.getToothProcedures(id).subscribe({
        next: (procs) => {
          this.procedures.set(procs);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
    }, { allowSignalWrites: true });
  }

  protected getTreatmentName(treatmentId: string): string {
    return this.treatments().find((t) => t.id === treatmentId)?.name ?? '—';
  }

  protected getTreatmentCurrencySymbol(treatmentId: string): string {
    const t = this.treatments().find((t) => t.id === treatmentId);
    return t?.currency === 'USD' ? '$' : 'Bs.';
  }

  protected getTreatmentBasePriceBob(treatmentId: string): number | null {
    const t = this.treatments().find((t) => t.id === treatmentId);
    return t?.currency === 'USD' ? (t.basePriceBob ?? null) : null;
  }

  protected formatDate(dateStr: string): string {
    const datePart = dateStr.slice(0, 10);
    const [y, m, d] = datePart.split('-');
    return `${d}/${m}/${y}`;
  }

  protected getSurfaces(proc: ToothProcedure): string {
    return proc.surfaces.length
      ? proc.surfaces.map((code) => SURFACE_ABBREVIATIONS[code]).join(', ')
      : '—';
  }

  protected onClose(): void {
    this.close.emit();
  }
}
