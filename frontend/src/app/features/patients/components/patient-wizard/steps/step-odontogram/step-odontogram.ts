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
import { DatePipe } from '@angular/common';
import type {
  DentalExam,
  DentalExamFinding,
  DentalExamVersionSummary,
} from '../../../../models/dental-exam.model';
import type {
  CreateDentalExamFindingRequest,
  CreateDentalExamRequest,
} from '../../../../models/dental-exam.request';
import type { DiagnosisCategory, Diagnosis, DiagnosisScope } from '../../../../../diagnoses/models/diagnosis.model';
import { OdontogramChartComponent } from '../../../../../../shared/ui/odontogram-chart/odontogram-chart';
import { field, allValid, touchAll } from '../../../../../../shared/validation/field';
import { normalizeText, optionalTextError, requiredTextError } from '../../../../../../shared/validation/text.validator';
import { BLACK_CLASSES, MOBILITY_GRADES } from '../../../../../../shared/validation/clinical-options';
import { modifierLabel } from '../../../../models/dental-exam-display.util';
import { DentalExamHistoryComponent } from '../../../dental-exam-history/dental-exam-history';
import {
  CatalogPickerComponent,
  type CatalogPickerExtraGroup,
  type CatalogPickerItem,
} from '../../../../../../shared/ui/catalog-picker/catalog-picker';

/**
 * Cómo arranca el paso (CLI-109): `new` = diagnóstico nuevo desde cero (el
 * paciente vuelve tras un tiempo), con el vigente solo de consulta;
 * `correct` = corregir el diagnóstico vigente, precargado.
 */
export type DentalExamMode = 'new' | 'correct';

/** Un hallazgo tal como lo arma el doctor en el panel, antes de mandarlo al backend. */
interface FindingDraft {
  readonly key: string;
  readonly diagnosisCode: string;
  readonly diagnosisName: string;
  readonly categoryName: string;
  readonly scope: DiagnosisScope;
  readonly color: string;
  readonly toothNumbers: number[];
  readonly modifierValue: string | null;
  readonly description: string;
  readonly xrayRequested: boolean;
  readonly notes: string | null;
}

let localKeySeq = 0;

/** Clave local de un hallazgo en edición: solo tiene que ser única dentro de la sesión. */
function localKey(): string {
  localKeySeq += 1;
  return `f-${Date.now()}-${localKeySeq}`;
}

function buildDraftsFromExam(exam: DentalExam): FindingDraft[] {
  const byGroup = new Map<string, DentalExamFinding[]>();
  const singles: DentalExamFinding[] = [];
  for (const f of exam.findings) {
    if (f.applicationGroupId) {
      const list = byGroup.get(f.applicationGroupId) ?? [];
      list.push(f);
      byGroup.set(f.applicationGroupId, list);
    } else {
      singles.push(f);
    }
  }

  const toDraft = (key: string, first: DentalExamFinding, teeth: number[]): FindingDraft => ({
    key,
    diagnosisCode: first.diagnosisCode,
    diagnosisName: first.diagnosisName,
    categoryName: first.categoryName,
    scope: first.diagnosisScope,
    color: first.diagnosisColor,
    toothNumbers: teeth,
    modifierValue: first.modifierValue,
    description: first.description ?? '',
    xrayRequested: first.xrayRequested,
    notes: first.notes,
  });

  const drafts = singles.map((f) =>
    toDraft(f.id, f, f.toothNumber != null ? [f.toothNumber] : []),
  );
  for (const [groupId, list] of byGroup) {
    const teeth = list
      .map((f) => f.toothNumber)
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    drafts.push(toDraft(groupId, list[0], teeth));
  }
  return drafts;
}

/**
 * Firma por valor de un conjunto de hallazgos — ignora `key` y el orden, así
 * "agregar y quitar el mismo hallazgo" o reabrir y guardar uno sin tocarlo
 * cuentan como sin cambios.
 */
function findingsSignature(drafts: readonly FindingDraft[]): string {
  return drafts
    .map((f) =>
      JSON.stringify([
        f.diagnosisCode,
        [...f.toothNumbers].sort((a, b) => a - b),
        f.modifierValue ?? null,
        f.description,
        f.xrayRequested,
        f.notes ?? null,
      ]),
    )
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

@Component({
  selector: 'app-step-odontogram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, OdontogramChartComponent, DentalExamHistoryComponent, CatalogPickerComponent],
  templateUrl: './step-odontogram.html',
  styleUrl: './step-odontogram.scss',
})
export class StepOdontogramComponent {
  readonly loading = input(false);
  readonly mode = input<DentalExamMode>('correct');
  readonly catalog = input<DiagnosisCategory[]>([]);
  /** Códigos de los diagnósticos que más usa el doctor (CLI-118) — chip "Frecuentes" del selector. */
  readonly frequentDiagnosisCodes = input<readonly string[]>([]);
  readonly currentExam = input<DentalExam | null>(null);
  readonly versions = input<DentalExamVersionSummary[]>([]);
  /** Para traer las versiones viejas del examen al desplegarlas (CLI-114). */
  readonly patientId = input<string | null>(null);
  readonly submitStep = output<CreateDentalExamRequest>();
  readonly back = output<void>();
  /** Salir sin guardar cuando no hubo cambios sobre el examen actual. */
  readonly closeWithoutChanges = output<void>();

  protected readonly allDiagnoses = computed<(Diagnosis & { categoryName: string })[]>(() =>
    this.catalog().flatMap((c) => c.diagnoses.map((d) => ({ ...d, categoryName: c.name }))),
  );

  protected readonly diagnosisShortcuts = computed<CatalogPickerExtraGroup[]>(() =>
    this.frequentDiagnosisCodes().length > 0
      ? [{ id: 'frequent', label: 'Frecuentes', itemIds: this.frequentDiagnosisCodes() }]
      : [],
  );

  /** Opciones del selector de diagnóstico (CLI-117): el code identifica, la categoría agrupa. */
  protected readonly diagnosisOptions = computed<CatalogPickerItem[]>(() =>
    this.allDiagnoses().map((d) => ({
      id: d.code,
      label: d.name,
      groupId: d.categoryId,
      groupLabel: d.categoryName,
      color: d.color,
      hint: this.scopeLabel(d.scope),
    })),
  );

  protected readonly legendItems = computed(() =>
    this.catalog()
      .filter((c) => c.diagnoses.length > 0)
      .map((c) => ({ name: c.name, color: c.diagnoses[0].color })),
  );

  protected readonly findings = signal<FindingDraft[]>([]);
  private findingsInitialized = false;

  protected readonly toothFindings = computed(() => this.findings().filter((f) => f.scope !== 'general'));
  protected readonly generalFindings = computed(() => this.findings().filter((f) => f.scope === 'general'));

  protected readonly toothColorMap = computed(() => {
    const map = new Map<number, string>();
    for (const f of this.toothFindings()) {
      for (const n of f.toothNumbers) {
        if (!map.has(n)) { map.set(n, f.color); }
      }
    }
    return map;
  });

  protected readonly hasPriorVersions = computed(() => this.versions().length > 0);

  /** Firma de los hallazgos tal como vinieron del examen actual (vacía si no hay examen). */
  private readonly initialSignature = signal(findingsSignature([]));
  protected readonly hasChanges = computed(
    () => findingsSignature(this.findings()) !== this.initialSignature(),
  );
  protected readonly isNewDiagnosis = computed(() => this.mode() === 'new');
  /**
   * Solo se bloquea el guardado "sin cambios" al corregir un examen existente —
   * en la primera carga o en un diagnóstico nuevo, un examen sin hallazgos
   * (boca sana) es válido.
   */
  protected readonly nothingToSave = computed(
    () => !this.isNewDiagnosis() && this.hasPriorVersions() && !this.hasChanges(),
  );
  /** Pide motivo solo al corregir el diagnóstico vigente y si algo cambió. */
  protected readonly requiresChangeReason = computed(
    () => !this.isNewDiagnosis() && this.hasPriorVersions() && this.hasChanges(),
  );

  // ── Diagnósticos anteriores (CLI-109/114) ─────────────────────────────────
  /** Examen elegido para copiar mientras se confirma sumarlo a los hallazgos ya cargados. */
  protected readonly pendingCopy = signal<DentalExam | null>(null);
  protected readonly showHistory = signal(false);

  // ── Panel de nuevo/edición de hallazgo ──────────────────────────────────
  protected readonly panelOpen = signal(false);
  protected readonly editingKey = signal<string | null>(null);
  protected readonly panelDiagnosisCode = signal('');
  protected readonly panelToothNumbers = signal<number[]>([]);
  protected readonly panelModifierValue = signal('');
  protected readonly panelDescription = field<string>('', (v: string) => optionalTextError(v, 500, 3));
  protected readonly panelNotes = field<string>('', (v: string) => optionalTextError(v, 500, 3));
  protected readonly panelXray = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly panelDiagnosis = computed(() =>
    this.allDiagnoses().find((d) => d.code === this.panelDiagnosisCode()) ?? null,
  );

  protected readonly modifierOptions = computed(() => {
    const modifier = this.panelDiagnosis()?.modifier;
    if (modifier === 'black_class') { return BLACK_CLASSES; }
    if (modifier === 'mobility_grade') { return MOBILITY_GRADES; }
    return [];
  });

  protected readonly changeReason = field<string>('', (v: string) =>
    this.requiresChangeReason() ? requiredTextError(v, 500, { minLength: 3 }) : optionalTextError(v, 500, 3),
  );

  constructor() {
    effect(() => {
      const exam = this.currentExam();
      // Un diagnóstico nuevo arranca en blanco: el vigente queda solo de consulta.
      if (!exam || this.findingsInitialized || this.isNewDiagnosis()) { return; }
      this.findingsInitialized = true;
      const drafts = buildDraftsFromExam(exam);
      this.findings.set(drafts);
      this.initialSignature.set(findingsSignature(drafts));
    }, { allowSignalWrites: true });
  }

  protected modifierLabel(value: string): string {
    return modifierLabel(value);
  }

  protected scopeLabel(scope: DiagnosisScope): string {
    if (scope === 'single_tooth') { return '1 pieza'; }
    if (scope === 'multiple_teeth') { return 'Varias piezas'; }
    return 'General';
  }

  // ── Chart ────────────────────────────────────────────────────────────────

  protected onToothClick(toothNumber: number): void {
    if (!this.panelOpen()) {
      this.openPanelForTooth(toothNumber);
      return;
    }
    const scope = this.panelDiagnosis()?.scope;
    if (scope === 'single_tooth') {
      this.panelToothNumbers.set([toothNumber]);
    } else if (scope === 'multiple_teeth') {
      this.panelToothNumbers.update((prev) =>
        prev.includes(toothNumber)
          ? prev.filter((n) => n !== toothNumber)
          : [...prev, toothNumber].sort((a, b) => a - b),
      );
    }
  }

  // ── Panel ────────────────────────────────────────────────────────────────

  private resetPanelFields(): void {
    this.panelDiagnosisCode.set('');
    this.panelModifierValue.set('');
    this.panelDescription.reset('');
    this.panelNotes.reset('');
    this.panelXray.set(false);
    this.formError.set(null);
  }

  protected openPanelForTooth(toothNumber: number): void {
    this.editingKey.set(null);
    this.resetPanelFields();
    this.panelToothNumbers.set([toothNumber]);
    this.panelOpen.set(true);
  }

  protected onAddFindingClick(): void {
    this.editingKey.set(null);
    this.resetPanelFields();
    this.panelToothNumbers.set([]);
    this.panelOpen.set(true);
  }

  protected onEditFinding(draft: FindingDraft): void {
    this.editingKey.set(draft.key);
    this.panelDiagnosisCode.set(draft.diagnosisCode);
    this.panelToothNumbers.set([...draft.toothNumbers]);
    this.panelModifierValue.set(draft.modifierValue ?? '');
    this.panelDescription.reset(draft.description);
    this.panelNotes.reset(draft.notes ?? '');
    this.panelXray.set(draft.xrayRequested);
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  protected removeFinding(key: string): void {
    this.findings.update((prev) => prev.filter((f) => f.key !== key));
  }

  protected onPanelDiagnosisChange(code: string): void {
    this.panelDiagnosisCode.set(code);
    const diagnosis = this.allDiagnoses().find((d) => d.code === code);
    if (!diagnosis) { return; }
    if (diagnosis.scope === 'general') {
      this.panelToothNumbers.set([]);
    } else if (diagnosis.scope === 'single_tooth' && this.panelToothNumbers().length > 1) {
      this.panelToothNumbers.set(this.panelToothNumbers().slice(0, 1));
    }
    if (diagnosis.modifier === 'none') {
      this.panelModifierValue.set('');
    }
  }

  protected onPanelCancel(): void {
    this.panelOpen.set(false);
    this.editingKey.set(null);
    this.formError.set(null);
  }

  protected onPanelSave(): void {
    touchAll(this.panelDescription, this.panelNotes);
    if (!allValid(this.panelDescription, this.panelNotes)) { return; }

    const diagnosis = this.panelDiagnosis();
    if (!diagnosis) {
      this.formError.set('Elegí un diagnóstico.');
      return;
    }
    const teeth = this.panelToothNumbers();
    if (diagnosis.scope === 'single_tooth' && teeth.length !== 1) {
      this.formError.set('Este diagnóstico requiere exactamente una pieza — hacé clic en un diente del odontograma.');
      return;
    }
    if (diagnosis.scope === 'multiple_teeth' && teeth.length < 1) {
      this.formError.set('Este diagnóstico requiere al menos una pieza — hacé clic en los dientes del odontograma.');
      return;
    }
    if (diagnosis.modifier !== 'none' && !this.panelModifierValue()) {
      this.formError.set(
        diagnosis.modifier === 'black_class'
          ? 'Elegí una clase de Black (I–V).'
          : 'Elegí un grado de movilidad (I–IV).',
      );
      return;
    }

    const draft: FindingDraft = {
      key: this.editingKey() ?? localKey(),
      diagnosisCode: diagnosis.code,
      diagnosisName: diagnosis.name,
      categoryName: diagnosis.categoryName,
      scope: diagnosis.scope,
      color: diagnosis.color,
      toothNumbers: diagnosis.scope === 'general' ? [] : [...teeth],
      modifierValue: diagnosis.modifier === 'none' ? null : this.panelModifierValue(),
      description: normalizeText(this.panelDescription.value()),
      xrayRequested: this.panelXray(),
      notes: normalizeText(this.panelNotes.value()) || null,
    };

    const editing = this.editingKey();
    this.findings.update((prev) =>
      editing ? prev.map((f) => (f.key === editing ? draft : f)) : [...prev, draft],
    );
    this.panelOpen.set(false);
    this.editingKey.set(null);
    this.formError.set(null);
  }

  // ── Historial ────────────────────────────────────────────────────────────

  protected onToggleHistory(): void {
    this.showHistory.update((v) => !v);
  }

  // ── Footer ───────────────────────────────────────────────────────────────

  protected onBack(): void {
    this.back.emit();
  }

  /** Copiar hallazgos de cualquier diagnóstico anterior; si ya hay hallazgos cargados, primero se confirma. */
  protected onCopyFrom(exam: DentalExam): void {
    if (this.findings().length > 0) {
      this.pendingCopy.set(exam);
      return;
    }
    this.appendCopies(exam);
  }

  protected onConfirmCopy(): void {
    const exam = this.pendingCopy();
    if (exam) { this.appendCopies(exam); }
  }

  protected onCancelCopy(): void {
    this.pendingCopy.set(null);
  }

  private appendCopies(exam: DentalExam): void {
    // Claves nuevas: copiar dos veces no debe repetir claves de la lista.
    const copies = buildDraftsFromExam(exam).map((d) => ({ ...d, key: localKey() }));
    this.findings.update((prev) => [...prev, ...copies]);
    this.pendingCopy.set(null);
  }

  protected onClose(): void {
    this.closeWithoutChanges.emit();
  }

  protected onSubmit(): void {
    if (this.nothingToSave()) { return; }
    // Un panel abierto sin diagnóstico elegido no tiene nada que perder — se cierra solo.
    if (this.panelOpen() && !this.panelDiagnosisCode()) {
      this.onPanelCancel();
    }
    if (this.panelOpen()) {
      this.formError.set('Guardá o cancelá el hallazgo que estás editando antes de continuar.');
      return;
    }
    touchAll(this.changeReason);
    if (!allValid(this.changeReason)) { return; }

    this.formError.set(null);
    const findings: CreateDentalExamFindingRequest[] = this.findings().map((f) => ({
      diagnosisCode: f.diagnosisCode,
      toothNumbers: f.toothNumbers.length > 0 ? f.toothNumbers : undefined,
      modifierValue: f.modifierValue ?? undefined,
      description: f.description || undefined,
      xrayRequested: f.xrayRequested,
      notes: f.notes ?? undefined,
    }));

    this.submitStep.emit({
      findings,
      kind: this.isNewDiagnosis() ? 'diagnosis' : undefined,
      changeReason: this.requiresChangeReason() ? normalizeText(this.changeReason.value()) : undefined,
    });
  }
}
