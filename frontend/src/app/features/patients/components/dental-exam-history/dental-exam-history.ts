import { Component, ChangeDetectionStrategy, inject, input, output, signal, computed, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import type { DentalExam, DentalExamFinding, DentalExamVersionSummary } from '../../models/dental-exam.model';
import { modifierLabel } from '../../models/dental-exam-display.util';
import { OdontogramChartComponent } from '../../../../shared/ui/odontogram-chart/odontogram-chart';
import { examLegendItems, examToothColorMap } from '../../../../shared/utils/odontogram-paint.util';

interface GroupedFinding {
  readonly key: string;
  readonly diagnosisName: string;
  readonly diagnosisColor: string;
  readonly toothNumbers: number[];
  readonly modifierValue: string | null;
  readonly description: string | null;
  readonly xrayRequested: boolean;
}

/** Un hallazgo multi-pieza se guarda como una fila por diente — acá se vuelven a juntar para mostrarlos. */
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
    diagnosisColor: first.diagnosisColor,
    toothNumbers: teeth,
    modifierValue: first.modifierValue,
    description: first.description,
    xrayRequested: first.xrayRequested,
  });
  const grouped = singles.map((f) => toGrouped(f.id, f, f.toothNumber != null ? [f.toothNumber] : []));
  for (const [groupId, list] of byGroup) {
    const teeth = list
      .map((f) => f.toothNumber)
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    grouped.push(toGrouped(groupId, list[0], teeth));
  }
  return grouped;
}

/**
 * Lista de las versiones del examen dental de un paciente, por fecha, cada
 * una desplegable con su odontograma en solo lectura (CLI-108, extraído en
 * CLI-114 para reusarlo en la historia clínica y en nuevo/corregir
 * diagnóstico). Con `canCopy`, cada examen desplegado ofrece copiar sus
 * hallazgos (`copyFindings`).
 */
@Component({
  selector: 'app-dental-exam-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, OdontogramChartComponent],
  templateUrl: './dental-exam-history.html',
  styleUrl: './dental-exam-history.scss',
})
export class DentalExamHistoryComponent {
  private readonly patientsService = inject(PatientsService);

  readonly patientId = input.required<string>();
  /** Todas las versiones, la más nueva primero (la primera es la vigente). */
  readonly versions = input<DentalExamVersionSummary[]>([]);
  /** El examen vigente ya cargado por quien usa el componente — evita pedirlo de nuevo. */
  readonly initialExam = input<DentalExam | null>(null);
  /** Si arranca desplegado el examen vigente. */
  readonly expandInitial = input(true);
  readonly canCopy = input(false);
  readonly copyFindings = output<DentalExam>();

  protected readonly expandedExamId = signal<string | null>(null);
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

  private initialized = false;

  constructor() {
    effect(() => {
      const exam = this.initialExam();
      if (!exam || this.initialized) { return; }
      this.initialized = true;
      this.examsById.update((prev) => new Map(prev).set(exam.id, exam));
      if (this.expandInitial()) { this.expandedExamId.set(exam.id); }
    }, { allowSignalWrites: true });
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
      const exam = await firstValueFrom(this.patientsService.getDentalExam(this.patientId(), examId));
      this.examsById.update((prev) => new Map(prev).set(exam.id, exam));
    } catch {
      this.examErrorId.set(examId);
    } finally {
      this.examLoadingId.set(null);
    }
  }

  protected onCopy(): void {
    const exam = this.expandedExam();
    if (exam) { this.copyFindings.emit(exam); }
  }

  protected modifierLabel(value: string): string {
    return modifierLabel(value);
  }
}
