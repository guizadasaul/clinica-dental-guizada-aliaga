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

interface ToothDef {
  readonly number: number;
  readonly type: 'incisor' | 'canine' | 'premolar' | 'molar';
  readonly arch: 'upper' | 'lower';
}

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

const UPPER_DECIDUOUS_TEETH: ToothDef[] = [
  { number: 55, type: 'molar',   arch: 'upper' },
  { number: 54, type: 'molar',   arch: 'upper' },
  { number: 53, type: 'canine',  arch: 'upper' },
  { number: 52, type: 'incisor', arch: 'upper' },
  { number: 51, type: 'incisor', arch: 'upper' },
  { number: 61, type: 'incisor', arch: 'upper' },
  { number: 62, type: 'incisor', arch: 'upper' },
  { number: 63, type: 'canine',  arch: 'upper' },
  { number: 64, type: 'molar',   arch: 'upper' },
  { number: 65, type: 'molar',   arch: 'upper' },
];

const LOWER_DECIDUOUS_TEETH: ToothDef[] = [
  { number: 85, type: 'molar',   arch: 'lower' },
  { number: 84, type: 'molar',   arch: 'lower' },
  { number: 83, type: 'canine',  arch: 'lower' },
  { number: 82, type: 'incisor', arch: 'lower' },
  { number: 81, type: 'incisor', arch: 'lower' },
  { number: 71, type: 'incisor', arch: 'lower' },
  { number: 72, type: 'incisor', arch: 'lower' },
  { number: 73, type: 'canine',  arch: 'lower' },
  { number: 74, type: 'molar',   arch: 'lower' },
  { number: 75, type: 'molar',   arch: 'lower' },
];

function isDeciduousNumber(toothNumber: number): boolean {
  const quadrant = Math.floor(toothNumber / 10);
  return quadrant >= 5 && quadrant <= 8;
}

function buildSanoEntries(
  teeth: ToothDef[],
  toothType: 'permanent' | 'deciduous',
): ToothEntry[] {
  return teeth.map((t) => ({
    toothNumber: t.number,
    toothType,
    diagnosisType: 'presuntivo',
    toothCondition: 'sano',
    diagnosisDescription: 'Diente sano',
  }));
}

function buildEntriesFromExisting(
  teeth: ToothDef[],
  toothType: 'permanent' | 'deciduous',
  byTooth: Map<number, OdontogramEntry>,
): ToothEntry[] {
  return teeth.map((t) => {
    const existing = byTooth.get(t.number);
    if (existing) {
      return {
        toothNumber: t.number,
        toothType: (existing.toothType as 'permanent' | 'deciduous') ?? toothType,
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
    ...buildSanoEntries(UPPER_TEETH, 'permanent'),
    ...buildSanoEntries(LOWER_TEETH, 'permanent'),
  ]);

  private readonly deciduousEntries = signal<ToothEntry[]>([
    ...buildSanoEntries(UPPER_DECIDUOUS_TEETH, 'deciduous'),
    ...buildSanoEntries(LOWER_DECIDUOUS_TEETH, 'deciduous'),
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

  protected readonly panelToothType = signal<'permanent' | 'deciduous'>('permanent');
  protected readonly panelDiagnosisType = signal<'presuntivo' | 'definitivo'>('presuntivo');
  protected readonly panelToothCondition = signal('sano');
  protected readonly panelDescription = signal('');
  protected readonly panelXray = signal(false);
  protected readonly panelNotes = signal('');

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

      const byTooth = new Map<number, OdontogramEntry>();
      for (const e of existing) {
        if (!byTooth.has(e.toothNumber)) {
          byTooth.set(e.toothNumber, e);
        }
      }
      this.permanentEntries.set([
        ...buildEntriesFromExisting(UPPER_TEETH, 'permanent', byTooth),
        ...buildEntriesFromExisting(LOWER_TEETH, 'permanent', byTooth),
      ]);
      this.deciduousEntries.set([
        ...buildEntriesFromExisting(UPPER_DECIDUOUS_TEETH, 'deciduous', byTooth),
        ...buildEntriesFromExisting(LOWER_DECIDUOUS_TEETH, 'deciduous', byTooth),
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
      this.panelToothType.set((existing.toothType as 'permanent' | 'deciduous') ?? cell.dentition);
      this.panelDiagnosisType.set((existing.diagnosisType as 'presuntivo' | 'definitivo') ?? 'presuntivo');
      this.panelToothCondition.set(existing.toothCondition ?? 'sano');
      this.panelDescription.set(existing.diagnosisDescription);
      this.panelXray.set(existing.xrayRequested ?? false);
      this.panelNotes.set(existing.notes ?? '');
    } else {
      this.panelToothType.set(cell.dentition);
      this.panelDiagnosisType.set('presuntivo');
      this.panelToothCondition.set('sano');
      this.panelDescription.set('');
      this.panelXray.set(false);
      this.panelNotes.set('');
    }
  }

  protected onPanelCancel(): void {
    this.selectedTooth.set(null);
    this.formError.set(null);
  }

  protected onPanelAdd(): void {
    if (!this.panelDescription().trim()) {
      this.formError.set('La descripción es obligatoria.');
      return;
    }
    const tooth = this.selectedTooth();
    if (!tooth) { return; }

    const newEntry: ToothEntry = {
      toothNumber: tooth.number,
      toothType: this.panelToothType(),
      diagnosisType: this.panelDiagnosisType(),
      toothCondition: this.panelToothCondition(),
      diagnosisDescription: this.panelDescription().trim(),
      xrayRequested: this.panelXray(),
      notes: this.panelNotes().trim() || undefined,
    };

    this.updateEntriesFor(tooth.dentition, (prev) => {
      const filtered = prev.filter((e) => e.toothNumber !== tooth.number);
      return [...filtered, newEntry];
    });

    this.selectedTooth.set(null);
    this.formError.set(null);
  }

  protected removeEntry(toothNumber: number): void {
    const dentition = isDeciduousNumber(toothNumber) ? 'deciduous' : 'permanent';
    this.updateEntriesFor(dentition, (prev) =>
      prev.map((e) =>
        e.toothNumber === toothNumber
          ? {
              toothNumber,
              toothType: dentition,
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
      if (!this.panelDescription().trim()) {
        this.formError.set('La descripción es obligatoria antes de guardar.');
        return;
      }
      this.onPanelAdd();
    }

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
