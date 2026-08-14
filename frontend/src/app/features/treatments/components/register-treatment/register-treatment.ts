import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  effect,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TreatmentsService } from '../../services/treatments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import type { Treatment, ToothProcedure } from '../../models/treatment.model';
import type { OdontogramEntry } from '../../../patients/models/patient.model';
import {
  TreatmentScopePickerComponent,
  type TreatmentScopeSelection,
} from '../treatment-scope-picker/treatment-scope-picker';

@Component({
  selector: 'app-register-treatment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TreatmentScopePickerComponent],
  templateUrl: './register-treatment.html',
  styleUrl: './register-treatment.scss',
})
export class RegisterTreatmentComponent {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly patientsService = inject(PatientsService);

  readonly patientId = input.required<string>();
  readonly done = output<void>();
  readonly cancel = output<void>();

  private readonly scopePicker = viewChild(TreatmentScopePickerComponent);

  protected readonly treatments = toSignal(
    this.treatmentsService.getAll(),
    { initialValue: [] as Treatment[] },
  );

  protected readonly odontogramEntries = signal<OdontogramEntry[]>([]);
  protected readonly registeredProcedures = signal<ToothProcedure[]>([]);
  protected readonly currentSelection = signal<TreatmentScopeSelection | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly panelPriceCharged = signal<number>(0);
  protected readonly panelProcedureDate = signal(new Date().toISOString().substring(0, 10));
  protected readonly panelVestibular = signal(false);
  protected readonly panelPalatal = signal(false);
  protected readonly panelMesial = signal(false);
  protected readonly panelDistal = signal(false);
  protected readonly panelOcclusal = signal(false);
  protected readonly panelNotes = signal('');

  constructor() {
    effect(() => {
      const id = this.patientId();
      if (!id) { return; }
      this.patientsService.getOdontogramEntries(id).subscribe({
        next: (entries) => this.odontogramEntries.set(entries),
        error: () => {},
      });
      this.treatmentsService.getToothProcedures(id).subscribe({
        next: (procedures) => this.registeredProcedures.set(procedures),
        error: () => {},
      });
    });

    effect(() => {
      const sel = this.currentSelection();
      if (sel) {
        this.panelPriceCharged.set(sel.treatment.basePrice);
      }
    }, { allowSignalWrites: true });
  }

  protected onSelectionChange(sel: TreatmentScopeSelection | null): void {
    const previousTreatmentId = this.currentSelection()?.treatment.id;
    this.currentSelection.set(sel);
    this.formError.set(null);
    this.successMessage.set(null);
    if (sel && sel.treatment.id !== previousTreatmentId) {
      this.panelProcedureDate.set(new Date().toISOString().substring(0, 10));
      this.panelVestibular.set(false);
      this.panelPalatal.set(false);
      this.panelMesial.set(false);
      this.panelDistal.set(false);
      this.panelOcclusal.set(false);
      this.panelNotes.set('');
    }
  }

  protected getTreatedTeeth(): number[] {
    const teeth: number[] = [];
    for (const p of this.registeredProcedures()) {
      if (p.toothNumber !== null) { teeth.push(p.toothNumber); }
    }
    return teeth;
  }

  protected onCancelSelection(): void {
    this.currentSelection.set(null);
    this.formError.set(null);
    this.scopePicker()?.reset();
  }

  protected async onSaveProcedure(): Promise<void> {
    const sel = this.currentSelection();
    if (!sel) { return; }

    if (!this.panelPriceCharged() || this.panelPriceCharged() <= 0) {
      this.formError.set('El precio cobrado debe ser mayor a 0.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    try {
      const result = await new Promise<ToothProcedure[]>((resolve, reject) => {
        this.treatmentsService.createToothProcedure(this.patientId(), {
          toothNumbers: sel.toothNumbers,
          treatmentId: sel.treatment.id,
          priceCharged: this.panelPriceCharged(),
          procedureDate: this.panelProcedureDate(),
          surfaceVestibular: this.panelVestibular(),
          surfacePalatal: this.panelPalatal(),
          surfaceMesial: this.panelMesial(),
          surfaceDistal: this.panelDistal(),
          surfaceOcclusal: this.panelOcclusal(),
          notes: this.panelNotes().trim() || undefined,
        }).subscribe({ next: resolve, error: reject });
      });

      this.registeredProcedures.update((prev) => [...prev, ...result]);
      this.successMessage.set(this.buildSuccessMessage(sel));
      this.currentSelection.set(null);
      this.scopePicker()?.reset();
    } catch {
      this.formError.set('Error al guardar el tratamiento. Intentá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  private buildSuccessMessage(sel: TreatmentScopeSelection): string {
    switch (sel.treatment.scope) {
      case 'tooth':
        return `Tratamiento registrado en diente #${sel.toothNumbers[0]}.`;
      case 'multi_tooth':
        return `Tratamiento registrado en ${sel.toothNumbers.length} dientes.`;
      case 'upper_arch':
        return 'Tratamiento registrado en la arcada superior.';
      case 'lower_arch':
        return 'Tratamiento registrado en la arcada inferior.';
      case 'full_mouth':
        return 'Tratamiento registrado en toda la boca.';
      default:
        return 'Tratamiento registrado.';
    }
  }

  protected getTreatmentName(treatmentId: string): string {
    return this.treatments().find((t) => t.id === treatmentId)?.name ?? treatmentId;
  }

  protected getTreatmentCurrencySymbol(treatmentId: string): string {
    const t = this.treatments().find((t) => t.id === treatmentId);
    return t?.currency === 'USD' ? '$' : 'Bs.';
  }

  protected onClose(): void {
    this.cancel.emit();
  }

  protected onFinish(): void {
    this.done.emit();
  }
}
