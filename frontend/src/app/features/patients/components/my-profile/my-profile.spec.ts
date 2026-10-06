import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { MyProfileComponent } from './my-profile';
import { PatientsService } from '../../services/patients.service';
import type { PatientClinicalRecord } from '../../models/clinical-record.model';
import type { Patient } from '../../models/patient.model';
import type { DentalExamFinding } from '../../models/dental-exam.model';

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'patient-1',
    userId: 'user-1',
    firstName: 'María',
    lastNamePaternal: 'Quispe',
    lastNameMaternal: 'Mamani',
    birthDate: '1992-03-14T00:00:00.000Z',
    birthPlace: 'La Paz',
    sex: 'femenino',
    occupation: 'Contadora',
    address: 'Calle 21 #45',
    zona: 'Calacoto',
    ciudad: 'La Paz',
    phone: '+59171234567',
    email: 'maria@correo.com',
    emergencyContactFirstName: 'Juan',
    emergencyContactLastName: 'Quispe',
    emergencyContactPhone: '+59170000000',
    emergencyContactRelationship: 'Esposo',
    consultationReason: 'Dolor en una muela',
    lastDentistVisit: null,
    lastVisitTreatment: null,
    familyHistory: null,
    documentType: 'ci',
    dni: '6543210',
    createdAt: '2025-03-14T12:00:00.000Z',
    updatedAt: '2025-03-14T12:00:00.000Z',
    assignedDoctorId: null,
    ...overrides,
  };
}

function finding(overrides: Partial<DentalExamFinding> = {}): DentalExamFinding {
  return {
    id: 'f-1',
    diagnosisId: 'd-1',
    diagnosisCode: 'caries',
    diagnosisName: 'Caries',
    diagnosisScope: 'tooth',
    diagnosisColor: '#e89858',
    categoryName: 'Caries',
    toothNumber: 16,
    toothType: 'permanent',
    applicationGroupId: null,
    modifierValue: 'clase_ii',
    description: 'Oclusal profunda',
    xrayRequested: true,
    notes: null,
    ...overrides,
  } as DentalExamFinding;
}

function record(overrides: Partial<PatientClinicalRecord> = {}): PatientClinicalRecord {
  return {
    patient: patient(),
    medicalHistory: {
      id: 'mh-1',
      patientId: 'patient-1',
      conditions: [{ code: 'hipertension', name: 'Hipertensión', notes: null }],
      otherDiseases: 'Gastritis',
      gestationLmpDate: null,
      gestationTrimester: null,
      anesthesiaReactions: false,
      medications: [{ id: 'm-1', drugName: 'Losartán', dose: '50 mg', frequency: 'cada 24 h', startedAt: null }],
      updatedAt: '2025-03-14T12:00:00.000Z',
    },
    hygieneHabits: {
      id: 'h-1',
      patientId: 'patient-1',
      usesToothbrush: true,
      brushingFrequency: 'thrice_daily',
      usesDentalFloss: false,
      usesToothpick: false,
      brushesTongue: true,
      usesMouthwash: true,
      updatedAt: '2025-03-14T12:00:00.000Z',
    },
    clinicalExam: {
      id: 'c-1',
      patientId: 'patient-1',
      tartar: true,
      saburra: false,
      bacterialPlaque: true,
      halitosis: false,
      occlusion: 'Normal',
      examDate: '2025-03-14T00:00:00.000Z',
      createdAt: '2025-03-14T12:00:00.000Z',
    },
    initialDiagnosis: {
      id: 'dx-1',
      patientId: 'patient-1',
      version: 1,
      kind: 'diagnosis',
      recordedBy: 'doctor-1',
      recordedByName: 'Dra. Lucía Mamani',
      recordedAt: '2025-03-14T15:00:00.000Z',
      changeReason: null,
      notes: 'Volver en seis meses para control.',
      findings: [
        finding({ id: 'f-2', toothNumber: 36, diagnosisName: 'Lesión periapical', modifierValue: null, description: null }),
        finding(),
        finding({ id: 'f-3', toothNumber: null, diagnosisName: 'Gingivitis', modifierValue: null, xrayRequested: false }),
      ],
    },
    ...overrides,
  };
}

function setup(response: Observable<PatientClinicalRecord>) {
  TestBed.configureTestingModule({
    imports: [MyProfileComponent],
    providers: [{ provide: PatientsService, useValue: { getMyClinicalRecord: () => response } }],
  });
  const fixture = TestBed.createComponent(MyProfileComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MyProfileComponent (CLI-214)', () => {
  afterEach(() => vi.useRealTimers());

  it('mientras carga lo dice', () => {
    expect(setup(NEVER).textContent).toContain('Cargando tu historia clínica...');
  });

  it('sin ficha (404) explica que la verá después de su primera visita', () => {
    expect(setup(throwError(() => ({ status: 404 }))).textContent).toContain('Todavía no tienes una ficha');
  });

  it('ante otro error lo dice', () => {
    expect(setup(throwError(() => ({ status: 500 }))).textContent).toContain('No pudimos cargar tu historia clínica');
  });

  it('muestra el encabezado con iniciales, nombre, datos y quién hizo la historia inicial', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    const root = setup(of(record()));
    const hero = root.querySelector('.hero')!;

    expect(hero.querySelector('.hero__avatar')?.textContent).toBe('MQ');
    expect(hero.querySelector('.hero__name')?.textContent).toBe('María Quispe Mamani');
    const chips = [...hero.querySelectorAll('.hero__chip-text')].map((c) => c.textContent);
    expect(chips).toEqual(['CI 6543210', '34 años', '+59171234567', 'maria@correo.com']);
    expect(hero.querySelector('.hero__recorded')?.textContent).toContain('14 de marzo de 2025 · Dra. Lucía Mamani');
  });

  it('muestra los datos personales legibles', () => {
    const text = setup(of(record())).querySelector('.facts')?.textContent ?? '';

    expect(text).toContain('14 de marzo de 1992');
    expect(text).toContain('Femenino');
    expect(text).toContain('Calle 21 #45, Calacoto, La Paz');
    expect(text).toContain('Juan Quispe (Esposo) +59170000000');
    expect(text).toContain('Dolor en una muela');
  });

  it('muestra antecedentes, medicamentos y reacción a la anestesia', () => {
    const root = setup(of(record()));
    const medical = root.querySelectorAll('.section')[1].textContent ?? '';

    expect(root.querySelector('.pills__item')?.textContent).toBe('Hipertensión');
    expect(medical).toContain('Gastritis');
    expect(medical).toContain('Losartán');
    expect(medical).toContain('50 mg');
    expect(medical).toContain('Reacción a la anestesia');
    expect(medical).toContain('No');
  });

  it('muestra los hábitos de higiene con la frecuencia de cepillado', () => {
    const root = setup(of(record()));
    const hygiene = root.querySelectorAll('.section')[2];

    expect(hygiene.querySelector('.highlight')?.textContent).toContain('3 veces al día');
    const yes = [...hygiene.querySelectorAll('.checks__item--yes')].map((i) => i.textContent);
    expect(yes.join(' ')).toContain('Enjuague bucal');
    expect(yes.join(' ')).not.toContain('Hilo dental');
  });

  it('muestra el examen clínico con su fecha', () => {
    const exam = setup(of(record())).querySelectorAll('.section')[3];

    expect(exam.querySelector('.section__date')?.textContent).toContain('14 de marzo de 2025');
    expect([...exam.querySelectorAll('.exam__item--found')].map((i) => i.querySelector('.exam__label')?.textContent)).toEqual([
      'Sarro',
      'Placa bacteriana',
    ]);
    expect(exam.textContent).toContain('Normal');
  });

  it('muestra el odontograma de solo lectura y los hallazgos ordenados por pieza', () => {
    const root = setup(of(record()));
    const diagnosis = root.querySelector('.diagnosis')!;

    expect(diagnosis.querySelector('app-odontogram-chart')).not.toBeNull();
    const items = [...diagnosis.querySelectorAll('.findings__item')];
    expect(items.map((i) => i.querySelector('.findings__place')?.textContent)).toEqual(['Pieza 16', 'Pieza 36', 'General']);
    expect(items[0].textContent).toContain('Caries (Clase II)');
    expect(items[0].textContent).toContain('Oclusal profunda');
    expect(items[0].textContent).toContain('Se solicitó radiografía');
    expect(items[2].querySelector('.findings__xray')).toBeNull();
    expect(diagnosis.querySelector('.diagnosis__notes')?.textContent).toContain('Volver en seis meses');
  });

  it('sin datos clínicos muestra cada sección vacía, y la fecha sale del examen clínico', () => {
    const root = setup(
      of(
        record({
          patient: patient({ dni: null, birthDate: '', phone: null, email: null, occupation: null }),
          medicalHistory: null,
          hygieneHabits: null,
          initialDiagnosis: null,
        }),
      ),
    );
    const text = root.textContent ?? '';

    expect(root.querySelectorAll('.hero__chip')).toHaveLength(0);
    expect(root.querySelector('.hero__recorded')?.textContent).toContain('14 de marzo de 2025');
    expect(text).toContain('Sin antecedentes registrados');
    expect(text).toContain('Sin hábitos registrados');
    expect(text).toContain('Todavía no hay un diagnóstico registrado');
  });

  it('un diagnóstico sin hallazgos lo dice', () => {
    const base = record();
    const root = setup(of(record({ initialDiagnosis: { ...base.initialDiagnosis!, findings: [], notes: null } })));

    expect(root.textContent).toContain('No se registraron hallazgos');
    expect(root.querySelector('.diagnosis__notes')).toBeNull();
  });
});
