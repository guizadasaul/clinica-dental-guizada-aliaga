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
import type { Treatment, ToothProcedure } from '../../models/treatment.model';

@Component({
  selector: 'app-treatment-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
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

  protected formatDate(dateStr: string): string {
    const datePart = dateStr.slice(0, 10);
    const [y, m, d] = datePart.split('-');
    return `${d}/${m}/${y}`;
  }

  protected getSurfaces(proc: ToothProcedure): string {
    const surfaces: string[] = [];
    if (proc.surfaceVestibular) { surfaces.push('Vest.'); }
    if (proc.surfacePalatal) { surfaces.push('Pal.'); }
    if (proc.surfaceMesial) { surfaces.push('Mes.'); }
    if (proc.surfaceDistal) { surfaces.push('Dis.'); }
    if (proc.surfaceOcclusal) { surfaces.push('Ocl.'); }
    return surfaces.length ? surfaces.join(', ') : '—';
  }

  protected onClose(): void {
    this.close.emit();
  }
}
