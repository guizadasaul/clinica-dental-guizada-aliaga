import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuotesService } from '../../services/quotes.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';
import type { Quote, QuoteItem } from '../../models/quote.model';
import type { Treatment } from '../../../treatments/models/treatment.model';
import { applicationTypeAllowsQuantity } from '../../../../shared/constants/dental-chart.constants';
import {
  TreatmentScopePickerComponent,
  type TreatmentScopeSelection,
} from '../../../treatments/components/treatment-scope-picker/treatment-scope-picker';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

interface GroupedItem {
  readonly key: string;
  readonly firstItemId: string;
  readonly toothNumbers: number[];
  readonly treatmentId: string;
  /** Siempre en Bs. — quote_items.unit_price ya viene convertido (ver D13 del plan de CLI-16). */
  readonly total: number;
  readonly currency: string;
  readonly exchangeRate: number | null;
}

@Component({
  selector: 'app-quote-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, DecimalPipe, DatePipe, FormsModule, TreatmentScopePickerComponent],
  templateUrl: './quote-builder.html',
  styleUrl: './quote-builder.scss',
})
export class QuoteBuilderComponent {
  private readonly quotesService = inject(QuotesService);
  private readonly treatmentsService = inject(TreatmentsService);

  readonly patientId = input.required<string>();
  readonly close = output<void>();

  private readonly scopePicker = viewChild(TreatmentScopePickerComponent);

  protected readonly treatments = toSignal(
    this.treatmentsService.getAll(),
    { initialValue: [] as Treatment[] },
  );

  protected readonly quote = signal<Quote | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly removingItemId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly currentSelection = signal<TreatmentScopeSelection | null>(null);
  protected readonly customPrice = signal<number | null>(null);
  protected readonly quantity = signal(1);

  protected readonly paymentAmount = signal<number | null>(null);
  protected readonly paymentMethod = signal<string>('');
  protected readonly paymentNotes = signal<string>('');
  protected readonly savingPayment = signal(false);
  protected readonly paymentError = signal<string | null>(null);

  protected readonly balance = computed(() => {
    const q = this.quote();
    return q ? q.totalAmount - q.totalPaid : 0;
  });

  protected readonly groupedItems = computed<GroupedItem[]>(() => {
    const items = this.quote()?.items ?? [];
    const groups = new Map<string, QuoteItem[]>();
    const order: string[] = [];
    for (const item of items) {
      const key = item.applicationGroupId ?? item.id;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(item);
    }
    return order.map((key) => {
      const rows = groups.get(key)!;
      const first = rows[0];
      return {
        key,
        firstItemId: first.id,
        toothNumbers: rows
          .map((r) => r.toothNumber)
          .filter((n): n is number => n !== null),
        treatmentId: first.treatmentId,
        // CLI-45: todas las filas de un grupo reportan el mismo subtotal (el
        // del grupo) — ya no hay que sumarlas, alcanza con tomar cualquiera.
        total: first.subtotal,
        currency: first.currency,
        exchangeRate: first.exchangeRate,
      };
    });
  });

  constructor() {
    effect(() => {
      const patientId = this.patientId();
      if (!patientId) { return; }
      this.loadOrCreateQuote(patientId);
    }, { allowSignalWrites: true });
  }

  private loadOrCreateQuote(patientId: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.quotesService.getByPatient(patientId).subscribe({
      next: (quotes) => {
        const open = quotes.find(
          (q) => q.status === 'pending' || q.status === 'partially_paid',
        );
        if (open) {
          this.quote.set(open);
          this.loading.set(false);
          return;
        }
        this.quotesService.createForPatient(patientId).subscribe({
          next: (created) => {
            this.quote.set(created);
            this.loading.set(false);
          },
          error: () => {
            this.loadError.set(true);
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onSelectionChange(sel: TreatmentScopeSelection | null): void {
    this.currentSelection.set(sel);
    this.formError.set(null);
    this.customPrice.set(null);
    this.quantity.set(1);
  }

  protected getTreatmentName(treatmentId: string): string {
    return this.treatments().find((t) => t.id === treatmentId)?.name ?? treatmentId;
  }

  /** El monto en USD original de la línea, reconstruido desde el tipo de cambio aplicado — line.total ya está en Bs. (D13). */
  protected getUsdEquivalent(line: GroupedItem): number | null {
    if (line.currency !== 'USD' || !line.exchangeRate) { return null; }
    return line.total / line.exchangeRate;
  }

  protected async onAddItem(): Promise<void> {
    const sel = this.currentSelection();
    const quote = this.quote();
    if (!sel || !quote) { return; }

    this.saving.set(true);
    this.formError.set(null);

    try {
      const updated = await new Promise<Quote>((resolve, reject) => {
        this.quotesService.addItem(quote.id, {
          treatmentId: sel.treatment.id,
          toothNumbers: sel.toothNumbers,
          customPrice: this.customPrice() ?? undefined,
          quantity: applicationTypeAllowsQuantity(sel.treatment.applicationType)
            ? this.quantity()
            : undefined,
        }).subscribe({ next: resolve, error: reject });
      });

      this.quote.set(updated);
      this.currentSelection.set(null);
      this.customPrice.set(null);
      this.quantity.set(1);
      this.scopePicker()?.reset();
    } catch {
      this.formError.set('No se pudo agregar la línea. Verificá los datos e intentá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onRemoveItem(itemId: string): Promise<void> {
    const quote = this.quote();
    if (!quote) { return; }

    this.removingItemId.set(itemId);
    try {
      const updated = await new Promise<Quote>((resolve, reject) => {
        this.quotesService.removeItem(quote.id, itemId).subscribe({ next: resolve, error: reject });
      });
      this.quote.set(updated);
    } catch {
      this.formError.set('No se pudo eliminar la línea. Intentá de nuevo.');
    } finally {
      this.removingItemId.set(null);
    }
  }

  protected async onAddPayment(): Promise<void> {
    const amount = this.paymentAmount();
    const quote = this.quote();
    if (!amount || amount <= 0 || !quote) { return; }

    this.savingPayment.set(true);
    this.paymentError.set(null);

    try {
      const updated = await new Promise<Quote>((resolve, reject) => {
        this.quotesService.addPayment(quote.id, {
          amount,
          paymentMethod: this.paymentMethod().trim() || undefined,
          notes: this.paymentNotes().trim() || undefined,
        }).subscribe({ next: resolve, error: reject });
      });

      this.quote.set(updated);
      this.paymentAmount.set(null);
      this.paymentMethod.set('');
      this.paymentNotes.set('');
    } catch {
      this.paymentError.set('No se pudo registrar el pago. Verificá los datos e intentá de nuevo.');
    } finally {
      this.savingPayment.set(false);
    }
  }

  protected onClose(): void {
    this.close.emit();
  }

  protected allowsQuantity(treatment: Treatment): boolean {
    return applicationTypeAllowsQuantity(treatment.applicationType);
  }
}
