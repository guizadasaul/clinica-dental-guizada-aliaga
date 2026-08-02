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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TreatmentsService } from '../../services/treatments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import type { Treatment, ToothProcedure } from '../../models/treatment.model';
import type { OdontogramEntry } from '../../../patients/models/patient.model';

interface ToothDef {
  readonly number: number;
  readonly type: 'incisor' | 'canine' | 'premolar' | 'molar';
  readonly arch: 'upper' | 'lower';
}

const DIAGNOSIS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'sano', label: 'Sano', color: '#16a34a' },
  { value: 'caries', label: 'Caries', color: '#dc2626' },
  { value: 'restauracion', label: 'Restauración', color: '#2563eb' },
  { value: 'corona', label: 'Corona', color: '#d97706' },
  { value: 'ausente', label: 'Ausente', color: '#9ca3af' },
  { value: 'extraccion', label: 'Extracción', color: '#7c3aed' },
  { value: 'endodoncia', label: 'Endodoncia', color: '#ea580c' },
  { value: 'fractura', label: 'Fractura', color: '#ca8a04' },
  { value: 'periodoncia', label: 'Periodoncia', color: '#0891b2' },
  { value: 'otro', label: 'Otro', color: '#374151' },
];

const UPPER_TEETH: ToothDef[] = [
  { number: 18, type: 'molar', arch: 'upper' },
  { number: 17, type: 'molar', arch: 'upper' },
  { number: 16, type: 'molar', arch: 'upper' },
  { number: 15, type: 'premolar', arch: 'upper' },
  { number: 14, type: 'premolar', arch: 'upper' },
  { number: 13, type: 'canine', arch: 'upper' },
  { number: 12, type: 'incisor', arch: 'upper' },
  { number: 11, type: 'incisor', arch: 'upper' },
  { number: 21, type: 'incisor', arch: 'upper' },
  { number: 22, type: 'incisor', arch: 'upper' },
  { number: 23, type: 'canine', arch: 'upper' },
  { number: 24, type: 'premolar', arch: 'upper' },
  { number: 25, type: 'premolar', arch: 'upper' },
  { number: 26, type: 'molar', arch: 'upper' },
  { number: 27, type: 'molar', arch: 'upper' },
  { number: 28, type: 'molar', arch: 'upper' },
];

const LOWER_TEETH: ToothDef[] = [
  { number: 48, type: 'molar', arch: 'lower' },
  { number: 47, type: 'molar', arch: 'lower' },
  { number: 46, type: 'molar', arch: 'lower' },
  { number: 45, type: 'premolar', arch: 'lower' },
  { number: 44, type: 'premolar', arch: 'lower' },
  { number: 43, type: 'canine', arch: 'lower' },
  { number: 42, type: 'incisor', arch: 'lower' },
  { number: 41, type: 'incisor', arch: 'lower' },
  { number: 31, type: 'incisor', arch: 'lower' },
  { number: 32, type: 'incisor', arch: 'lower' },
  { number: 33, type: 'canine', arch: 'lower' },
  { number: 34, type: 'premolar', arch: 'lower' },
  { number: 35, type: 'premolar', arch: 'lower' },
  { number: 36, type: 'molar', arch: 'lower' },
  { number: 37, type: 'molar', arch: 'lower' },
  { number: 38, type: 'molar', arch: 'lower' },
];

@Component({
  selector: 'app-register-treatment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './register-treatment.html',
  styleUrl: './register-treatment.scss',
})
export class RegisterTreatmentComponent {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly patientsService = inject(PatientsService);

  readonly patientId = input.required<string>();
  readonly done = output<void>();
  readonly cancel = output<void>();

  protected readonly upperTeeth = UPPER_TEETH;
  protected readonly lowerTeeth = LOWER_TEETH;
  protected readonly diagnosisOptions = DIAGNOSIS_OPTIONS;

  protected readonly treatments = toSignal(
    this.treatmentsService.getAll(),
    { initialValue: [] as Treatment[] },
  );

  protected readonly odontogramEntries = signal<OdontogramEntry[]>([]);
  protected readonly registeredProcedures = signal<ToothProcedure[]>([]);
  protected readonly selectedTooth = signal<ToothDef | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly panelTreatmentId = signal('');
  protected readonly panelPriceCharged = signal<number>(0);
  protected readonly panelProcedureDate = signal(new Date().toISOString().substring(0, 10));
  protected readonly panelVestibular = signal(false);
  protected readonly panelPalatal = signal(false);
  protected readonly panelMesial = signal(false);
  protected readonly panelDistal = signal(false);
  protected readonly panelOcclusal = signal(false);
  protected readonly panelNotes = signal('');

  protected readonly diagnosisMap = computed(() => {
    const map = new Map<number, OdontogramEntry>();
    for (const e of this.odontogramEntries()) {
      if (!map.has(e.toothNumber)) {
        map.set(e.toothNumber, e);
      }
    }
    return map;
  });

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
      const id = this.panelTreatmentId();
      const found = this.treatments().find((t) => t.id === id);
      if (found) {
        this.panelPriceCharged.set(found.basePrice);
      }
    }, { allowSignalWrites: true });
  }

  protected getToothColor(toothNumber: number): string {
    const entry = this.diagnosisMap().get(toothNumber);
    if (!entry) { return 'white'; }
    return DIAGNOSIS_OPTIONS.find((d) => d.value === entry.toothCondition)?.color ?? '#374151';
  }

  protected getToothStroke(toothNumber: number): string {
    const selected = this.selectedTooth();
    if (selected?.number === toothNumber) { return '#1a2b5e'; }
    const hasProcedure = this.registeredProcedures().some((p) => p.toothNumber === toothNumber);
    if (hasProcedure) { return '#16a34a'; }
    return this.diagnosisMap().has(toothNumber) ? '#6b7280' : '#d1d5db';
  }

  protected getToothStrokeWidth(toothNumber: number): number {
    return this.selectedTooth()?.number === toothNumber ? 2.5 : 1.5;
  }

  protected getDiagnosisColor(value: string): string {
    return DIAGNOSIS_OPTIONS.find((d) => d.value === value)?.color ?? '#374151';
  }

  protected getDiagnosisLabel(value: string): string {
    return DIAGNOSIS_OPTIONS.find((d) => d.value === value)?.label ?? value;
  }

  protected onToothClick(tooth: ToothDef): void {
    this.selectedTooth.set(tooth);
    this.formError.set(null);
    this.successMessage.set(null);
    this.panelTreatmentId.set('');
    this.panelPriceCharged.set(0);
    this.panelProcedureDate.set(new Date().toISOString().substring(0, 10));
    this.panelVestibular.set(false);
    this.panelPalatal.set(false);
    this.panelMesial.set(false);
    this.panelDistal.set(false);
    this.panelOcclusal.set(false);
    this.panelNotes.set('');
  }

  protected onPanelCancel(): void {
    this.selectedTooth.set(null);
    this.formError.set(null);
  }

  protected async onSaveProcedure(): Promise<void> {
    const tooth = this.selectedTooth();
    if (!tooth) { return; }

    if (!this.panelTreatmentId()) {
      this.formError.set('Seleccioná un tratamiento.');
      return;
    }
    if (!this.panelPriceCharged() || this.panelPriceCharged() <= 0) {
      this.formError.set('El precio cobrado debe ser mayor a 0.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    try {
      const result = await new Promise<ToothProcedure>((resolve, reject) => {
        this.treatmentsService.createToothProcedure(this.patientId(), {
          toothNumber: tooth.number,
          treatmentId: this.panelTreatmentId(),
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

      this.registeredProcedures.update((prev) => [...prev, result]);
      this.successMessage.set(`Tratamiento registrado en diente #${tooth.number}.`);
      this.selectedTooth.set(null);
    } catch {
      this.formError.set('Error al guardar el tratamiento. Intentá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected getTreatmentName(treatmentId: string): string {
    return this.treatments().find((t) => t.id === treatmentId)?.name ?? treatmentId;
  }

  protected onClose(): void {
    this.cancel.emit();
  }

  protected onFinish(): void {
    this.done.emit();
  }
}
