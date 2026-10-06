import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { PatientsService } from '../../services/patients.service';
import type { PatientClinicalRecord } from '../../models/clinical-record.model';
import type { ClinicalExam, HygieneHabits, Patient } from '../../models/patient.model';
import type { DentalExamFinding } from '../../models/dental-exam.model';
import { modifierLabel } from '../../models/dental-exam-display.util';
import { BRUSHING_FREQUENCY_LABELS } from '../patient-wizard/steps/step-oral-hygiene/step-oral-hygiene';
import type { BrushingFrequency } from '../../../../shared/validation/clinical-options';
import { OdontogramChartComponent } from '../../../../shared/ui/odontogram-chart/odontogram-chart';
import {
  examLegendItems,
  examToothColorMap,
  examToothNames,
} from '../../../../shared/utils/odontogram-paint.util';
import { CLINIC_TIME_ZONE } from '../../../../shared/utils/clinic-date.util';

const HYGIENE_HABITS: { key: keyof HygieneHabits; label: string; icon: string }[] = [
  { key: 'usesToothbrush', label: 'Cepillo dental', icon: 'brush' },
  { key: 'usesDentalFloss', label: 'Hilo dental', icon: 'gesture' },
  { key: 'brushesTongue', label: 'Cepillado de lengua', icon: 'sentiment_satisfied' },
  { key: 'usesMouthwash', label: 'Enjuague bucal', icon: 'water_drop' },
  { key: 'usesToothpick', label: 'Palillo', icon: 'edit' },
];

const CLINICAL_FINDINGS: { key: keyof ClinicalExam; label: string }[] = [
  { key: 'tartar', label: 'Sarro' },
  { key: 'bacterialPlaque', label: 'Placa bacteriana' },
  { key: 'saburra', label: 'Saburra' },
  { key: 'halitosis', label: 'Halitosis' },
];

const DOCUMENT_LABELS: Record<string, string> = { ci: 'CI', pasaporte: 'Pasaporte', nit: 'NIT' };
const SEX_LABELS: Record<string, string> = { masculino: 'Masculino', femenino: 'Femenino', otro: 'Otro' };

// Fechas sin hora (nacimiento, examen clínico): en UTC para no correrlas un día.
const DATE_ONLY = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const DATE_TIME = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; record: PatientClinicalRecord };

interface FactView {
  label: string;
  value: string;
}

function ageFrom(birthDate: string, now: Date): number {
  const birth = new Date(birthDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

/**
 * "Mi perfil" del paciente (CLI-214): la historia clínica que el doctor armó
 * en la primera visita — datos personales, antecedentes médicos, hábitos de
 * higiene, primer examen clínico y el diagnóstico inicial con su odontograma.
 * Es de solo lectura (GET /patients/me/clinical-record, CLI-213).
 */
@Component({
  selector: 'app-my-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OdontogramChartComponent],
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.scss',
})
export class MyProfileComponent {
  private readonly patientsService = inject(PatientsService);

  protected readonly state = toSignal(
    this.patientsService.getMyClinicalRecord().pipe(
      map((record): LoadState => ({ status: 'ready', record })),
      catchError((error: { status?: number }) =>
        of<LoadState>({ status: error?.status === 404 ? 'missing' : 'error' }),
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState },
  );

  protected readonly record = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.record : null;
  });

  protected readonly hygieneHabits = HYGIENE_HABITS;
  protected readonly clinicalFindings = CLINICAL_FINDINGS;

  protected readonly initials = computed(() => {
    const p = this.record()?.patient;
    return p ? `${p.firstName.charAt(0)}${p.lastNamePaternal.charAt(0)}`.toUpperCase() : '';
  });

  protected readonly fullName = computed(() => {
    const p = this.record()?.patient;
    return p ? [p.firstName, p.lastNamePaternal, p.lastNameMaternal].filter(Boolean).join(' ') : '';
  });

  protected readonly chips = computed(() => {
    const p = this.record()?.patient;
    if (!p) {
      return [];
    }
    const chips: { icon: string; text: string }[] = [];
    if (p.dni) {
      chips.push({ icon: 'badge', text: `${DOCUMENT_LABELS[p.documentType ?? ''] ?? 'Doc.'} ${p.dni}` });
    }
    if (p.birthDate) {
      chips.push({ icon: 'cake', text: `${ageFrom(p.birthDate, new Date())} años` });
    }
    if (p.phone) {
      chips.push({ icon: 'call', text: p.phone });
    }
    if (p.email) {
      chips.push({ icon: 'mail', text: p.email });
    }
    return chips;
  });

  /** Fecha y doctor de la historia inicial: los del primer diagnóstico, o del primer examen clínico. */
  protected readonly recordedLine = computed(() => {
    const r = this.record();
    if (r?.initialDiagnosis) {
      const date = DATE_TIME.format(new Date(r.initialDiagnosis.recordedAt));
      return r.initialDiagnosis.recordedByName ? `${date} · ${r.initialDiagnosis.recordedByName}` : date;
    }
    return r?.clinicalExam ? DATE_ONLY.format(new Date(r.clinicalExam.examDate)) : null;
  });

  protected readonly personalFacts = computed<FactView[]>(() => {
    const p = this.record()?.patient;
    return p ? personalFacts(p) : [];
  });

  protected readonly clinicalExamDate = computed(() => {
    const exam = this.record()?.clinicalExam;
    return exam ? DATE_ONLY.format(new Date(exam.examDate)) : null;
  });

  // ── Diagnóstico inicial ───────────────────────────────────────────────────
  private readonly findings = computed(() => this.record()?.initialDiagnosis?.findings ?? []);
  protected readonly toothColor = computed(() => examToothColorMap(this.findings()));
  protected readonly toothNames = computed(() => examToothNames(this.findings()));
  protected readonly legend = computed(() => examLegendItems(this.findings()));
  /** Hallazgos ordenados por pieza; los generales (sin pieza) al final. */
  protected readonly sortedFindings = computed(() =>
    [...this.findings()].sort((a, b) => (a.toothNumber ?? 99) - (b.toothNumber ?? 99)),
  );

  protected brushingLabel(value: string | null): string | null {
    return value ? (BRUSHING_FREQUENCY_LABELS[value as BrushingFrequency] ?? value) : null;
  }

  protected anesthesiaLabel(value: boolean | null): string {
    if (value === true) {
      return 'Sí';
    }
    return value === false ? 'No' : 'No sabe';
  }

  protected findingPlace(f: DentalExamFinding): string {
    return f.toothNumber === null ? 'General' : `Pieza ${f.toothNumber}`;
  }

  protected findingTitle(f: DentalExamFinding): string {
    return f.modifierValue ? `${f.diagnosisName} (${modifierLabel(f.modifierValue)})` : f.diagnosisName;
  }

  protected habitValue(habits: HygieneHabits, key: keyof HygieneHabits): boolean {
    return habits[key] === true;
  }

  protected findingValue(exam: ClinicalExam, key: keyof ClinicalExam): boolean {
    return exam[key] === true;
  }
}

function personalFacts(p: Patient): FactView[] {
  const facts: FactView[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) {
      facts.push({ label, value });
    }
  };
  add('Fecha de nacimiento', p.birthDate ? DATE_ONLY.format(new Date(p.birthDate)) : null);
  add('Lugar de nacimiento', p.birthPlace);
  add('Sexo', p.sex ? (SEX_LABELS[p.sex] ?? p.sex) : null);
  add('Ocupación', p.occupation);
  add('Dirección', [p.address, p.zona, p.ciudad].filter(Boolean).join(', '));
  const emergency = [p.emergencyContactFirstName, p.emergencyContactLastName].filter(Boolean).join(' ');
  add(
    'Contacto de emergencia',
    emergency
      ? [emergency, p.emergencyContactRelationship ? `(${p.emergencyContactRelationship})` : null, p.emergencyContactPhone]
          .filter(Boolean)
          .join(' ')
      : null,
  );
  add('Motivo de la primera consulta', p.consultationReason);
  return facts;
}
