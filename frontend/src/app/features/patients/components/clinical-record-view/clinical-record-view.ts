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
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import type { Patient, MedicalHistory, HygieneHabits, ClinicalExam } from '../../models/patient.model';
import type { DentalExam, DentalExamFinding, DentalExamVersionSummary } from '../../models/dental-exam.model';
import { modifierLabel } from '../../models/dental-exam-display.util';
import { BRUSHING_FREQUENCY_LABELS } from '../patient-wizard/steps/step-oral-hygiene/step-oral-hygiene';
import type { BrushingFrequency } from '../../../../shared/validation/clinical-options';
import { OdontogramChartComponent } from '../../../../shared/ui/odontogram-chart/odontogram-chart';
import { examLegendItems, examToothColorMap } from '../../../../shared/utils/odontogram-paint.util';

interface GroupedFinding {
  readonly key: string;
  readonly diagnosisName: string;
  readonly categoryName: string;
  readonly diagnosisColor: string;
  readonly toothNumbers: number[];
  readonly modifierValue: string | null;
  readonly description: string | null;
  readonly xrayRequested: boolean;
  readonly notes: string | null;
}

const HYGIENE_HABIT_LABELS: { key: keyof HygieneHabits; label: string }[] = [
  { key: 'usesToothbrush', label: 'Usa cepillo dental' },
  { key: 'usesDentalFloss', label: 'Usa hilo dental' },
  { key: 'usesToothpick', label: 'Usa palillo' },
  { key: 'brushesTongue', label: 'Cepilla la lengua' },
  { key: 'usesMouthwash', label: 'Usa enjuague bucal' },
];

const CLINICAL_FINDING_LABELS: { key: keyof ClinicalExam; label: string }[] = [
  { key: 'tartar', label: 'Sarro / Tártaro' },
  { key: 'saburra', label: 'Saburra' },
  { key: 'bacterialPlaque', label: 'Placa bacteriana' },
  { key: 'halitosis', label: 'Halitosis' },
];

function groupFindings(findings: DentalExamFinding[]): GroupedFinding[] {
  const byGroup = new Map<string, DentalExamFinding[]>();
  const singles: DentalExamFinding[] = [];
  for (const f of findings) {
    if (f.applicationGroupId) {
      const list = byGroup.get(f.applicationGroupId) ?? [];
      list.push(f);
      byGroup.set(f.applicationGroupId, list);
    } else {
      singles.push(f);
    }
  }

  const toGrouped = (key: string, first: DentalExamFinding, teeth: number[]): GroupedFinding => ({
    key,
    diagnosisName: first.diagnosisName,
    categoryName: first.categoryName,
    diagnosisColor: first.diagnosisColor,
    toothNumbers: teeth,
    modifierValue: first.modifierValue,
    description: first.description,
    xrayRequested: first.xrayRequested,
    notes: first.notes,
  });

  const grouped = singles.map((f) =>
    toGrouped(f.id, f, f.toothNumber != null ? [f.toothNumber] : []),
  );
  for (const [groupId, list] of byGroup) {
    const teeth = list
      .map((f) => f.toothNumber)
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    grouped.push(toGrouped(groupId, list[0], teeth));
  }
  return grouped;
}

/** Resumen de solo lectura de la ficha completa de un paciente (CLI-40) —
 * a diferencia del wizard, no permite editar nada ni dispara ningún guardado. */
@Component({
  selector: 'app-clinical-record-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, OdontogramChartComponent],
  templateUrl: './clinical-record-view.html',
  styleUrl: './clinical-record-view.scss',
})
export class ClinicalRecordViewComponent {
  private readonly patientsService = inject(PatientsService);

  readonly patient = input.required<Patient>();
  readonly close = output<void>();

  protected readonly hygieneHabitLabels = HYGIENE_HABIT_LABELS;
  protected readonly clinicalFindingLabels = CLINICAL_FINDING_LABELS;

  protected readonly medicalHistory = signal<MedicalHistory | null>(null);
  protected readonly hygieneHabits = signal<HygieneHabits | null>(null);
  protected readonly clinicalExam = signal<ClinicalExam | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  // ── Exámenes dentales (CLI-108) ──────────────────────────────────────────
  /** Todas las versiones del examen dental, la más nueva primero. */
  protected readonly examVersions = signal<DentalExamVersionSummary[]>([]);
  /** Examen desplegado (acordeón, uno a la vez) — arranca en el actual. */
  protected readonly expandedExamId = signal<string | null>(null);
  /** Exámenes ya traídos del backend, para no volver a pedirlos al re-desplegar. */
  private readonly examsById = signal<ReadonlyMap<string, DentalExam>>(new Map());
  protected readonly examLoadingId = signal<string | null>(null);
  protected readonly examErrorId = signal<string | null>(null);

  protected readonly expandedExam = computed(() => {
    const id = this.expandedExamId();
    return id ? (this.examsById().get(id) ?? null) : null;
  });
  protected readonly expandedToothColor = computed(() => examToothColorMap(this.expandedExam()?.findings ?? []));
  protected readonly expandedLegend = computed(() => examLegendItems(this.expandedExam()?.findings ?? []));

  protected readonly toothFindings = computed(() =>
    groupFindings(this.expandedExam()?.findings ?? []).filter((f) => f.toothNumbers.length > 0),
  );
  protected readonly generalFindings = computed(() =>
    groupFindings(this.expandedExam()?.findings ?? []).filter((f) => f.toothNumbers.length === 0),
  );

  private loadedForId: string | null = null;

  constructor() {
    effect(() => {
      const p = this.patient();
      if (!p || this.loadedForId === p.id) { return; }
      this.loadedForId = p.id;
      void this.load(p.id);
    }, { allowSignalWrites: true });
  }

  private async load(patientId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [medicalHistory, hygieneHabits, clinicalExam, currentExam, versions] = await Promise.all([
        firstValueFrom(this.patientsService.getMedicalHistory(patientId)),
        firstValueFrom(this.patientsService.getHygieneHabits(patientId)),
        firstValueFrom(this.patientsService.getLatestClinicalExam(patientId)),
        firstValueFrom(this.patientsService.getCurrentDentalExam(patientId)),
        firstValueFrom(this.patientsService.getDentalExamVersions(patientId)),
      ]);
      this.medicalHistory.set(medicalHistory);
      this.hygieneHabits.set(hygieneHabits);
      this.clinicalExam.set(clinicalExam);
      this.examVersions.set(versions);
      if (currentExam) {
        this.examsById.set(new Map([[currentExam.id, currentExam]]));
        this.expandedExamId.set(currentExam.id);
      }
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async onToggleExam(examId: string): Promise<void> {
    if (this.expandedExamId() === examId) {
      this.expandedExamId.set(null);
      return;
    }
    this.expandedExamId.set(examId);
    this.examErrorId.set(null);
    if (this.examsById().has(examId)) { return; }

    this.examLoadingId.set(examId);
    try {
      const exam = await firstValueFrom(this.patientsService.getDentalExam(this.patient().id, examId));
      this.examsById.update((prev) => new Map(prev).set(exam.id, exam));
    } catch {
      this.examErrorId.set(examId);
    } finally {
      this.examLoadingId.set(null);
    }
  }

  protected fullName(p: Patient): string {
    return `${p.firstName} ${p.lastNamePaternal}${p.lastNameMaternal ? ' ' + p.lastNameMaternal : ''}`;
  }

  private static readonly DOCUMENT_TYPE_LABELS: Record<string, string> = {
    ci: 'CI',
    pasaporte: 'Pasaporte',
    nit: 'NIT',
  };

  /** (documentType, dni) es el par único real (CLI-54) — se muestran juntos. */
  protected documentLabel(p: Patient): string {
    if (!p.dni) { return '—'; }
    const typeLabel = p.documentType
      ? (ClinicalRecordViewComponent.DOCUMENT_TYPE_LABELS[p.documentType] ?? p.documentType)
      : null;
    return typeLabel ? `${typeLabel} ${p.dni}` : p.dni;
  }

  protected brushingFrequencyLabel(value: string | null): string {
    if (!value) { return ''; }
    return BRUSHING_FREQUENCY_LABELS[value as BrushingFrequency] ?? value;
  }

  protected modifierLabel(value: string): string {
    return modifierLabel(value);
  }

  protected anesthesiaReactionsLabel(value: boolean | null): string {
    if (value === true) { return 'Sí'; }
    if (value === false) { return 'No'; }
    return 'No sabe';
  }

  /** Derivado por el backend (CLI-50) — nunca se interpreta a ojo acá. */
  protected gestationTrimesterLabel(trimester: 1 | 2 | 3 | null): string {
    const ORDINALS = { 1: '1er', 2: '2do', 3: '3er' } as const;
    return trimester === null ? '' : `${ORDINALS[trimester]} trimestre`;
  }

  protected onClose(): void {
    this.close.emit();
  }
}
