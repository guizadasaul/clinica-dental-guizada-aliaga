import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ClinicalRecordViewComponent } from './clinical-record-view';
import { PatientsService } from '../../services/patients.service';
import type { Patient } from '../../models/patient.model';
import type { DentalExam, DentalExamFinding, DentalExamVersionSummary } from '../../models/dental-exam.model';

const PATIENT: Patient = {
  id: 'patient-1',
  userId: 'user-1',
  firstName: 'Julian',
  lastNamePaternal: 'Alvarez',
  lastNameMaternal: null,
  birthDate: '1990-01-01',
  birthPlace: null,
  sex: null,
  occupation: null,
  address: null,
  zona: null,
  ciudad: null,
  phone: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelationship: null,
  consultationReason: null,
  lastDentistVisit: null,
  lastVisitTreatment: null,
  familyHistory: null,
  documentType: null,
  dni: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assignedDoctorId: null,
};

function finding(toothNumber: number | null, color: string, overrides: Partial<DentalExamFinding> = {}): DentalExamFinding {
  return {
    id: `f-${toothNumber}-${color}`,
    diagnosisId: 'diag-1',
    diagnosisCode: 'caries_segundo_grado',
    diagnosisName: 'Caries de segundo grado',
    diagnosisScope: 'single_tooth',
    diagnosisColor: color,
    categoryName: 'Caries dentales',
    toothNumber,
    toothType: 'permanent',
    applicationGroupId: null,
    modifierValue: null,
    description: null,
    xrayRequested: false,
    notes: null,
    ...overrides,
  };
}

function exam(id: string, version: number, findings: DentalExamFinding[]): DentalExam {
  return {
    id,
    patientId: 'patient-1',
    version,
    kind: version === 1 ? 'diagnosis' : 'correction',
    recordedBy: 'doctor-1',
    recordedByName: 'Dr. Saul',
    recordedAt: `2026-0${version}-10T12:00:00.000Z`,
    changeReason: null,
    notes: null,
    findings,
  };
}

const CURRENT = exam('exam-2', 2, [finding(16, '#dc2626')]);
const OLD = exam('exam-1', 1, [finding(36, '#2563eb', { categoryName: 'Restauraciones / obturaciones' })]);

const VERSIONS: DentalExamVersionSummary[] = [
  { id: 'exam-2', version: 2, kind: 'correction', recordedBy: 'doctor-1', recordedByName: 'Dr. Saul', recordedAt: CURRENT.recordedAt, changeReason: 'Caries nueva', findingsCount: 1 },
  { id: 'exam-1', version: 1, kind: 'diagnosis', recordedBy: 'doctor-1', recordedByName: 'Dr. Saul', recordedAt: OLD.recordedAt, changeReason: null, findingsCount: 1 },
];

function setup(versions: DentalExamVersionSummary[] = VERSIONS, current: DentalExam | null = CURRENT) {
  const getDentalExam = vi.fn(() => of(OLD));
  TestBed.configureTestingModule({
    imports: [ClinicalRecordViewComponent],
    providers: [
      {
        provide: PatientsService,
        useValue: {
          getMedicalHistory: () => of(null),
          getHygieneHabits: () => of(null),
          getLatestClinicalExam: () => of(null),
          getCurrentDentalExam: () => of(current),
          getDentalExamVersions: () => of(versions),
          getDentalExam,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClinicalRecordViewComponent);
  fixture.componentRef.setInput('patient', PATIENT);
  return { fixture, getDentalExam };
}

/** El componente carga con async/await sobre firstValueFrom — hay que dejar correr esas continuaciones. */
async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function fillOf(root: HTMLElement, toothNumber: number): string | null {
  return root
    .querySelector(`.odontogram-chart__cell[aria-label="Diente ${toothNumber}"] .odontogram-chart__cell-shape`)
    ?.getAttribute('fill') ?? null;
}

describe('ClinicalRecordViewComponent — exámenes dentales', () => {
  it('lista todas las versiones y despliega la actual con su odontograma', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.record__exam')).toHaveLength(2);
    expect(root.querySelector('.record__exam--open .record__exam-badge')?.textContent).toContain('Actual');
    expect(root.querySelectorAll('app-odontogram-chart')).toHaveLength(1);
    expect(fillOf(root, 16)).toBe('#dc2626');
    expect(root.querySelector('.record__exam-reason')?.textContent).toContain('Caries nueva');
    const kinds = [...root.querySelectorAll('.record__exam-kind')].map((k) => k.textContent?.trim());
    expect(kinds).toEqual(['Corrección', 'Diagnóstico']);
  });

  it('el odontograma es de solo lectura: sin role=button ni tabindex', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const cell = (fixture.nativeElement as HTMLElement).querySelector('.odontogram-chart__cell[aria-label="Diente 16"]');

    expect(cell?.getAttribute('role')).toBeNull();
    expect(cell?.getAttribute('tabindex')).toBeNull();
  });

  it('al hacer clic en otra versión la trae una sola vez y pinta sus colores', async () => {
    const { fixture, getDentalExam } = setup();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const toggles = root.querySelectorAll<HTMLButtonElement>('.record__exam-toggle');

    toggles[1].click();
    await settle(fixture);
    expect(getDentalExam).toHaveBeenCalledWith('patient-1', 'exam-1');
    expect(fillOf(root, 36)).toBe('#2563eb');
    expect(fillOf(root, 16)).toBe('transparent');

    toggles[0].click();
    await settle(fixture);
    toggles[1].click();
    await settle(fixture);
    expect(getDentalExam).toHaveBeenCalledTimes(1);
  });

  it('sin exámenes muestra el mensaje vacío', async () => {
    const { fixture } = setup([], null);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Todavía no se registró ningún examen dental');
  });
});
