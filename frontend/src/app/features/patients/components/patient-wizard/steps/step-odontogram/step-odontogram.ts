import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OdontogramEntry } from '../../../../models/patient.model';
import type { CreateOdontogramEntryRequest } from '../../../../models/patient.request';
import { ODONTOGRAM_CELLS, type OdontogramCell } from './odontogram-cells';
import {
  UPPER_TEETH,
  LOWER_TEETH,
  UPPER_DECIDUOUS_TEETH,
  LOWER_DECIDUOUS_TEETH,
} from '../../../../../../shared/constants/dental-chart.constants';
import type { ToothDef } from '../../../../../../shared/constants/dental-chart.constants';
import { field, allValid, touchAll } from '../../../../../../shared/validation/field';
import { normalizeText, requiredTextError, optionalTextError } from '../../../../../../shared/validation/text.validator';
import { toothTypeFor } from '../../../../../../shared/validation/tooth.validator';

interface ToothEntry extends CreateOdontogramEntryRequest {
  readonly toothNumber: number;
  diagnosisType: string;
  toothCondition: string;
  diagnosisDescription: string;
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

function buildSanoEntries(teeth: ToothDef[]): ToothEntry[] {
  return teeth.map((t) => ({
    toothNumber: t.number,
    toothType: toothTypeFor(t.number) ?? 'permanent',
    diagnosisType: 'presuntivo',
    toothCondition: 'sano',
    diagnosisDescription: 'Diente sano',
  }));
}

function buildEntriesFromExisting(
  teeth: ToothDef[],
  byTooth: Map<number, OdontogramEntry>,
): ToothEntry[] {
  return teeth.map((t) => {
    const existing = byTooth.get(t.number);
    const toothType = toothTypeFor(t.number) ?? 'permanent';
    if (existing) {
      return {
        toothNumber: t.number,
        toothType,
        diagnosisType: existing.diagnosisType,
        toothCondition: existing.toothCondition,
        diagnosisDescription: existing.diagnosisDescription,
        xrayRequested: existing.xrayRequested,
        notes: existing.notes ?? undefined,
      };
    }
    return {
      toothNumber: t.number,
      toothType,
      diagnosisType: 'presuntivo',
      toothCondition: 'sano',
      diagnosisDescription: 'Diente sano',
    };
  });
}

@Component({
  selector: 'app-step-odontogram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-odontogram.html',
  styleUrl: './step-odontogram.scss',
})
export class StepOdontogramComponent {
  readonly loading = input(false);
  readonly initialEntries = input<OdontogramEntry[]>([]);
  readonly submitStep = output<CreateOdontogramEntryRequest[]>();
  readonly back = output<void>();

  protected readonly diagnosisOptions = DIAGNOSIS_OPTIONS;

  /** Interactive hit-cells overlaid on /assets/svg/odontogram.svg. */
  protected readonly cells = ODONTOGRAM_CELLS;
  protected readonly odontogramUrl = '/assets/svg/odontogram.svg';

  private readonly permanentEntries = signal<ToothEntry[]>([
    ...buildSanoEntries(UPPER_TEETH),
    ...buildSanoEntries(LOWER_TEETH),
  ]);

  private readonly deciduousEntries = signal<ToothEntry[]>([
    ...buildSanoEntries(UPPER_DECIDUOUS_TEETH),
    ...buildSanoEntries(LOWER_DECIDUOUS_TEETH),
  ]);

  /** Every tooth (both dentitions) — the chart now shows them all at once. */
  protected readonly entries = computed(() => [
    ...this.permanentEntries(),
    ...this.deciduousEntries(),
  ]);

  /** Only real findings (non-sano) — shown in the "Diagnósticos registrados" list. */
  protected readonly diagnosedEntries = computed(() =>
    this.entries().filter((e) => e.toothCondition !== 'sano'),
  );

  protected readonly selectedTooth = signal<OdontogramCell | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly panelDiagnosisType = signal<'presuntivo' | 'definitivo'>('presuntivo');
  protected readonly panelToothCondition = signal('sano');
  // @Length(3, 500) del DTO — antes solo se chequeaba "no vacío".
  protected readonly panelDescription = field<string>('', (v: string) => requiredTextError(v, 500, { minLength: 3 }));
  protected readonly panelXray = signal(false);
  // Mínimo de 3 caracteres cuando hay contenido (campo sigue opcional).
  protected readonly panelNotes = field<string>('', (v: string) => optionalTextError(v, 500, 3));

  protected readonly entriesMap = computed(() => {
    const map = new Map<number, ToothEntry>();
    for (const e of this.entries()) {
      map.set(e.toothNumber, e);
    }
    return map;
  });

  private entriesInitialized = false;

  constructor() {
    effect(() => {
      const existing = this.initialEntries();
      if (this.entriesInitialized || existing.length === 0) { return; }
      this.entriesInitialized = true;

      // Preferimos la entry con treatmentId == null (el diagnóstico del chart)
      // sobre la que trae un tratamiento — findOdontogramEntries ordena por
      // created_at desc, así que sin este criterio se prefería la más nueva
      // sin importar su origen (ver corrección del plan CLI-39).
      const byTooth = new Map<number, OdontogramEntry>();
      for (const e of existing) {
        const current = byTooth.get(e.toothNumber);
        if (!current || (current.treatmentId != null && e.treatmentId == null)) {
          byTooth.set(e.toothNumber, e);
        }
      }
      this.permanentEntries.set([
        ...buildEntriesFromExisting(UPPER_TEETH, byTooth),
        ...buildEntriesFromExisting(LOWER_TEETH, byTooth),
      ]);
      this.deciduousEntries.set([
        ...buildEntriesFromExisting(UPPER_DECIDUOUS_TEETH, byTooth),
        ...buildEntriesFromExisting(LOWER_DECIDUOUS_TEETH, byTooth),
      ]);
    }, { allowSignalWrites: true });
  }

  private updateEntriesFor(
    dentition: 'permanent' | 'deciduous',
    fn: (prev: ToothEntry[]) => ToothEntry[],
  ): void {
    if (dentition === 'deciduous') {
      this.deciduousEntries.update(fn);
    } else {
      this.permanentEntries.update(fn);
    }
  }

  protected getToothColor(toothNumber: number): string {
    const entry = this.entriesMap().get(toothNumber);
    if (!entry) { return 'white'; }
    return DIAGNOSIS_OPTIONS.find((d) => d.value === entry.toothCondition)?.color ?? '#374151';
  }

  /** A tooth is "diagnosed" (and therefore tinted on the chart) when it is not sano. */
  protected isDiagnosed(toothNumber: number): boolean {
    const entry = this.entriesMap().get(toothNumber);
    return !!entry && entry.toothCondition !== 'sano';
  }

  /**
   * Fill used for the tooth's paint group: the diagnosis color when diagnosed,
   * a highlight when selected-but-healthy, otherwise transparent. Opacity (and the
   * solid look when selected) is handled on the group so overlapping parts stay even.
   */
  protected paintFill(toothNumber: number): string {
    if (this.isDiagnosed(toothNumber)) {
      return this.getToothColor(toothNumber);
    }
    return this.selectedTooth()?.number === toothNumber ? '#1a2b5e' : 'transparent';
  }

  protected onToothClick(cell: OdontogramCell): void {
    const existing = this.entriesMap().get(cell.number);
    this.selectedTooth.set(cell);
    this.formError.set(null);
    if (existing) {
      this.panelDiagnosisType.set((existing.diagnosisType as 'presuntivo' | 'definitivo') ?? 'presuntivo');
      this.panelToothCondition.set(existing.toothCondition ?? 'sano');
      this.panelDescription.reset(existing.diagnosisDescription);
      this.panelXray.set(existing.xrayRequested ?? false);
      this.panelNotes.reset(existing.notes ?? '');
    } else {
      this.panelDiagnosisType.set('presuntivo');
      this.panelToothCondition.set('sano');
      this.panelDescription.reset('');
      this.panelXray.set(false);
      this.panelNotes.reset('');
    }
  }

  protected onPanelCancel(): void {
    this.selectedTooth.set(null);
    this.formError.set(null);
  }

  protected onPanelAdd(): void {
    touchAll(this.panelDescription, this.panelNotes);
    if (!allValid(this.panelDescription, this.panelNotes)) {
      return;
    }
    const tooth = this.selectedTooth();
    if (!tooth) { return; }

    const newEntry: ToothEntry = {
      toothNumber: tooth.number,
      toothType: toothTypeFor(tooth.number) ?? tooth.dentition,
      diagnosisType: this.panelDiagnosisType(),
      toothCondition: this.panelToothCondition(),
      diagnosisDescription: normalizeText(this.panelDescription.value()),
      xrayRequested: this.panelXray(),
      notes: normalizeText(this.panelNotes.value()) || undefined,
    };

    this.updateEntriesFor(tooth.dentition, (prev) => {
      const filtered = prev.filter((e) => e.toothNumber !== tooth.number);
      return [...filtered, newEntry];
    });

    this.selectedTooth.set(null);
    this.formError.set(null);
  }

  protected removeEntry(toothNumber: number): void {
    const toothType = toothTypeFor(toothNumber) ?? 'permanent';
    this.updateEntriesFor(toothType, (prev) =>
      prev.map((e) =>
        e.toothNumber === toothNumber
          ? {
              toothNumber,
              toothType,
              diagnosisType: 'presuntivo',
              toothCondition: 'sano',
              diagnosisDescription: 'Diente sano',
            }
          : e,
      ),
    );
    if (this.selectedTooth()?.number === toothNumber) {
      this.selectedTooth.set(null);
    }
  }

  protected getDiagnosisLabel(value: string): string {
    return DIAGNOSIS_OPTIONS.find((d) => d.value === value)?.label ?? value;
  }

  protected getDiagnosisColor(value: string): string {
    return DIAGNOSIS_OPTIONS.find((d) => d.value === value)?.color ?? '#374151';
  }

  protected onBack(): void {
    this.back.emit();
  }

  protected onSubmit(): void {
    if (this.selectedTooth()) {
      touchAll(this.panelDescription, this.panelNotes);
      if (!allValid(this.panelDescription, this.panelNotes)) {
        this.formError.set('Corregí los errores del diagnóstico actual antes de guardar.');
        return;
      }
      this.onPanelAdd();
    }

    this.formError.set(null);
    const allEntries = [...this.permanentEntries(), ...this.deciduousEntries()];
    this.submitStep.emit(
      allEntries.map((e) => ({
        toothNumber: e.toothNumber,
        toothType: e.toothType,
        diagnosisType: e.diagnosisType,
        toothCondition: e.toothCondition,
        diagnosisDescription: e.diagnosisDescription,
        xrayRequested: e.xrayRequested,
        notes: e.notes,
      })),
    );
  }
}
