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

  const facts = (section: Element) =>
    Object.fromEntries(
      [...section.querySelectorAll('.facts__row')].map((r) => [
        r.querySelector('dt')?.textContent?.trim(),
        r.querySelector('dd')?.textContent?.trim().replaceAll(/\s+/g, ' '),
      ]),
    );

  it('el encabezado dice cuándo y quién hizo la historia inicial', () => {
    const root = setup(of(record()));

    expect(root.querySelector('.page-header__subtitle')?.textContent).toContain(
      'Historia clínica inicial · 14/03/2025 · Dra. Lucía Mamani',
    );
  });

  it('muestra los datos personales una sola vez, legibles', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    const personal = facts(setup(of(record())).querySelectorAll('.card')[0]);

    expect(personal).toMatchObject({
      Nombre: 'María Quispe Mamani',
      Documento: 'CI 6543210',
      'Fecha de nacimiento': '14/03/1992 (34 años)',
      Sexo: 'Femenino',
      Teléfono: '+59171234567',
      Correo: 'maria@correo.com',
      Dirección: 'Calle 21 #45, Calacoto, La Paz',
      'Contacto de emergencia': 'Juan Quispe (Esposo) +59170000000',
      'Motivo de la primera consulta': 'Dolor en una muela',
    });
  });

  it('muestra antecedentes, medicamentos y reacción a la anestesia', () => {
    const medical = facts(setup(of(record())).querySelectorAll('.card')[1]);

    expect(medical).toMatchObject({
      Condiciones: 'Hipertensión',
      'Otras enfermedades': 'Gastritis',
      Medicamentos: 'Losartán 50 mg · cada 24 h',
      'Reacción a la anestesia': 'No',
    });
  });

  it('muestra los hábitos de higiene con Sí/No en texto', () => {
    const hygiene = facts(setup(of(record())).querySelectorAll('.card')[2]);

    expect(hygiene).toMatchObject({
      Cepillado: '3 veces al día',
      'Enjuague bucal': 'Sí',
      'Hilo dental': 'No',
    });
  });

  it('muestra el examen clínico', () => {
    const exam = facts(setup(of(record())).querySelectorAll('.card')[3]);

    expect(exam).toMatchObject({ Sarro: 'Sí', Saburra: 'No', 'Placa bacteriana': 'Sí', Oclusión: 'Normal' });
  });

  it('muestra el odontograma de solo lectura y los hallazgos ordenados por pieza', () => {
    const diagnosis = setup(of(record())).querySelectorAll('.card')[4];

    expect(diagnosis.querySelector('app-odontogram-chart')).not.toBeNull();
    const items = [...diagnosis.querySelectorAll('.findings__item')];
    expect(items.map((i) => i.querySelector('.findings__place')?.textContent)).toEqual(['Pieza 16', 'Pieza 36', 'General']);
    expect(items[0].textContent).toContain('Caries (Clase II)');
    expect(items[0].textContent).toContain('Oclusal profunda');
    expect(items[0].textContent).toContain('Se solicitó radiografía');
    expect(items[2].textContent).not.toContain('radiografía');
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

    expect(root.querySelector('.page-header__subtitle')?.textContent).toContain('Historia clínica inicial · 14/03/2025');
    expect(facts(root.querySelectorAll('.card')[0])).not.toHaveProperty('Documento');
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
