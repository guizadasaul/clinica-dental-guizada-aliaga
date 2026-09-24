import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  effect,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import type { Patient, MedicalHistory, HygieneHabits, ClinicalExam } from '../../models/patient.model';
import type { DentalExam, DentalExamVersionSummary } from '../../models/dental-exam.model';
import { BRUSHING_FREQUENCY_LABELS } from '../patient-wizard/steps/step-oral-hygiene/step-oral-hygiene';
import type { BrushingFrequency } from '../../../../shared/validation/clinical-options';
import { DentalExamHistoryComponent } from '../dental-exam-history/dental-exam-history';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

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

/** Resumen de solo lectura de la ficha completa de un paciente (CLI-40) —
 * a diferencia del wizard, no permite editar nada ni dispara ningún guardado. */
@Component({
  selector: 'app-clinical-record-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, DatePipe, DentalExamHistoryComponent],
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

  // ── Exámenes dentales (CLI-108): la lista y el visor viven en DentalExamHistoryComponent (CLI-114) ─
  protected readonly examVersions = signal<DentalExamVersionSummary[]>([]);
  protected readonly currentExam = signal<DentalExam | null>(null);

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
      this.currentExam.set(currentExam);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
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
