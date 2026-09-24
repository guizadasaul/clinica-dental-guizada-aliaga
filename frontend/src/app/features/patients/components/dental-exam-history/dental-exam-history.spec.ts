import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DentalExamHistoryComponent } from './dental-exam-history';
import { PatientsService } from '../../services/patients.service';
import type { DentalExam, DentalExamVersionSummary } from '../../models/dental-exam.model';

function exam(id: string, version: number, toothNumber: number): DentalExam {
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
    findings: [
      {
        id: `f-${id}`,
        diagnosisId: 'diag-1',
        diagnosisCode: 'caries_segundo_grado',
        diagnosisName: 'Caries de segundo grado',
        diagnosisScope: 'single_tooth',
        diagnosisColor: '#dc2626',
        categoryName: 'Caries dentales',
        toothNumber,
        toothType: 'permanent',
        applicationGroupId: null,
        modifierValue: null,
        description: null,
        xrayRequested: false,
        notes: null,
      },
    ],
  };
}

const CURRENT = exam('exam-2', 2, 16);
const OLD = exam('exam-1', 1, 36);
const VERSIONS: DentalExamVersionSummary[] = [CURRENT, OLD].map((e) => ({
  id: e.id,
  version: e.version,
  kind: e.kind,
  recordedBy: e.recordedBy,
  recordedByName: e.recordedByName,
  recordedAt: e.recordedAt,
  changeReason: null,
  findingsCount: 1,
}));

async function setup(canCopy: boolean) {
  const getDentalExam = vi.fn(() => of(OLD));
  TestBed.configureTestingModule({
    imports: [DentalExamHistoryComponent],
    providers: [{ provide: PatientsService, useValue: { getDentalExam } }],
  });
  const fixture = TestBed.createComponent(DentalExamHistoryComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  fixture.componentRef.setInput('versions', VERSIONS);
  fixture.componentRef.setInput('initialExam', CURRENT);
  fixture.componentRef.setInput('canCopy', canCopy);
  await settle(fixture);
  return { fixture, getDentalExam };
}

async function settle(fixture: ReturnType<typeof TestBed.createComponent<DentalExamHistoryComponent>>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

describe('DentalExamHistoryComponent', () => {
  it('lista las versiones y despliega la vigente sin pedirla al backend', async () => {
    const { fixture, getDentalExam } = await setup(false);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.exam-history__item')).toHaveLength(2);
    expect(root.querySelector('.exam-history__item--open .exam-history__badge')?.textContent).toContain('Actual');
    expect(root.querySelector('app-odontogram-chart')).toBeTruthy();
    expect(getDentalExam).not.toHaveBeenCalled();
  });

  it('sin canCopy no ofrece copiar', async () => {
    const { fixture } = await setup(false);

    expect((fixture.nativeElement as HTMLElement).querySelector('.exam-history__copy')).toBeNull();
  });

  it('con canCopy emite el examen desplegado, incluso uno viejo traído del backend', async () => {
    const { fixture, getDentalExam } = await setup(true);
    const copied: DentalExam[] = [];
    fixture.componentInstance.copyFindings.subscribe((e) => copied.push(e));
    const root = fixture.nativeElement as HTMLElement;

    root.querySelectorAll<HTMLButtonElement>('.exam-history__toggle')[1].click();
    await settle(fixture);
    (root.querySelector('.exam-history__copy') as HTMLButtonElement).click();

    expect(getDentalExam).toHaveBeenCalledWith('patient-1', 'exam-1');
    expect(copied.map((e) => e.id)).toEqual(['exam-1']);
  });
});
