import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { Treatment, TreatmentScope } from '../../models/treatment.model';
import type { OdontogramEntry } from '../../../patients/models/patient.model';
import {
  UPPER_TEETH,
  LOWER_TEETH,
  teethForScope,
} from '../../../../shared/constants/dental-chart.constants';
import type { ToothDef } from '../../../../shared/constants/dental-chart.constants';

export interface TreatmentScopeSelection {
  readonly treatment: Treatment;
  readonly toothNumbers: number[];
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

/**
 * Elige un tratamiento y los dientes a los que aplica, respetando su
 * `scope`: tooth (uno solo, clic reemplaza), multi_tooth (2+, clic
 * togglea), upper_arch/lower_arch/full_mouth (predeterminados por el
 * scope, sin clic) y none (sin odontograma). Emite la selección completa
 * apenas es válida — quien lo usa (register-treatment, y a futuro
 * quote-builder de CLI-16) reacciona a eso, no hay botón de "confirmar"
 * acá: en `tooth` el clic ya confirmaba antes de este cambio, y en
 * `multi_tooth` alcanzar 2 dientes ya es la confirmación.
 */
@Component({
  selector: 'app-treatment-scope-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './treatment-scope-picker.html',
  styleUrl: './treatment-scope-picker.scss',
})
export class TreatmentScopePickerComponent {
  readonly treatments = input.required<Treatment[]>();
  readonly odontogramEntries = input<OdontogramEntry[]>([]);
  readonly treatedTeeth = input<number[]>([]);
  readonly selectionChange = output<TreatmentScopeSelection | null>();

  protected readonly upperTeeth = UPPER_TEETH;
  protected readonly lowerTeeth = LOWER_TEETH;
  protected readonly diagnosisOptions = DIAGNOSIS_OPTIONS;

  protected readonly selectedTreatmentId = signal('');
  protected readonly selectedTeeth = signal<number[]>([]);

  protected readonly selectedTreatment = computed<Treatment | null>(
    () => this.treatments().find((t) => t.id === this.selectedTreatmentId()) ?? null,
  );

  protected readonly scope = computed<TreatmentScope | null>(
    () => this.selectedTreatment()?.scope ?? null,
  );

  protected readonly isClickable = computed(
    () => this.scope() === 'tooth' || this.scope() === 'multi_tooth',
  );

  protected readonly showOdontogram = computed(
    () => this.scope() !== null && this.scope() !== 'none',
  );

  protected readonly highlightedTeeth = computed(() => {
    const scope = this.scope();
    return scope ? teethForScope(scope) : [];
  });

  /**
   * Los dientes que realmente se mandan al backend. Para las arcadas va
   * vacío a propósito — el backend (assertTeethMatchScope) exige que no
   * venga ningún diente en esos scopes y deriva los suyos con su propio
   * teethForScope(); highlightedTeeth() de acá es solo para pintar el
   * odontograma, no para el payload.
   */
  private readonly effectiveToothNumbers = computed<number[]>(() => {
    const scope = this.scope();
    if (scope === 'tooth' || scope === 'multi_tooth') {
      return this.selectedTeeth();
    }
    return [];
  });

  protected readonly selectionValid = computed(() => {
    const scope = this.scope();
    if (!scope) { return false; }
    const teeth = this.effectiveToothNumbers();
    if (scope === 'tooth') { return teeth.length === 1; }
    if (scope === 'multi_tooth') { return teeth.length >= 2; }
    return true;
  });

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
      const treatment = this.selectedTreatment();
      if (treatment && this.selectionValid()) {
        this.selectionChange.emit({
          treatment,
          toothNumbers: this.effectiveToothNumbers(),
        });
      } else {
        this.selectionChange.emit(null);
      }
    });
  }

  /** Limpia la selección — lo llama el consumidor tras guardar. */
  reset(): void {
    this.selectedTreatmentId.set('');
    this.selectedTeeth.set([]);
  }

  protected onTreatmentChange(id: string): void {
    this.selectedTreatmentId.set(id);
    this.selectedTeeth.set([]);
  }

  protected onToothClick(tooth: ToothDef): void {
    const scope = this.scope();
    if (scope === 'tooth') {
      this.selectedTeeth.set([tooth.number]);
      return;
    }
    if (scope === 'multi_tooth') {
      this.selectedTeeth.update((prev) =>
        prev.includes(tooth.number)
          ? prev.filter((n) => n !== tooth.number)
          : [...prev, tooth.number],
      );
    }
  }

  protected isSelected(toothNumber: number): boolean {
    const scope = this.scope();
    if (scope === 'tooth' || scope === 'multi_tooth') {
      return this.selectedTeeth().includes(toothNumber);
    }
    return this.highlightedTeeth().includes(toothNumber);
  }

  protected getToothColor(toothNumber: number): string {
    const entry = this.diagnosisMap().get(toothNumber);
    if (!entry) { return 'white'; }
    return DIAGNOSIS_OPTIONS.find((d) => d.value === entry.toothCondition)?.color ?? '#374151';
  }

  protected getToothStroke(toothNumber: number): string {
    if (this.isSelected(toothNumber)) { return '#1a2b5e'; }
    if (this.treatedTeeth().includes(toothNumber)) { return '#16a34a'; }
    return this.diagnosisMap().has(toothNumber) ? '#6b7280' : '#d1d5db';
  }

  protected getToothStrokeWidth(toothNumber: number): number {
    return this.isSelected(toothNumber) ? 2.5 : 1.5;
  }
}
