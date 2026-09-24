import { PatientsController } from './patients.controller';
import { PatientsService } from '../../application/patients.service';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser';
import type { CreatePatientDto } from './dto/create-patient.dto';
import type { CreateMedicalHistoryDto } from './dto/create-medical-history.dto';
import type { CreateHygieneHabitsDto } from './dto/create-hygiene-habits.dto';
import type { CreateClinicalExamDto } from './dto/create-clinical-exam.dto';
import type { CreateToothProcedureDto } from './dto/create-tooth-procedure.dto';

const DOCTOR = { uid: 'doctor-auth-1' } as AuthenticatedUser;
const PATIENT_ID = 'patient-1';

describe('PatientsController', () => {
  const mockService = {
    findAll: jest.fn(),
    findMyPatient: jest.fn(),
    findMyPatientStatus: jest.fn(),
    createPatient: jest.fn(),
    updatePatient: jest.fn(),
    upsertMedicalHistory: jest.fn(),
    findMedicalHistory: jest.fn(),
    upsertHygieneHabits: jest.fn(),
    findHygieneHabits: jest.fn(),
    createClinicalExam: jest.fn(),
    findLatestClinicalExam: jest.fn(),
    findOdontogramEntries: jest.fn(),
    createOdontogramEntries: jest.fn(),
    createToothProcedure: jest.fn(),
    findToothProcedures: jest.fn(),
    createDentalExam: jest.fn(),
    findDentalExamVersions: jest.fn(),
    findCurrentDentalExam: jest.fn(),
    findDentalExam: jest.fn(),
  };
  let controller: PatientsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PatientsController(
      mockService as unknown as PatientsService,
    );
  });

  describe('lecturas que delegan tal cual', () => {
    it('findAll filtra por el doctorId del query', async () => {
      mockService.findAll.mockResolvedValue(['p']);

      await expect(
        controller.findAll({ doctorId: 'doctor-1' }),
      ).resolves.toEqual(['p']);
      expect(mockService.findAll).toHaveBeenCalledWith('doctor-1');
    });

    it('me y me/status usan el uid del usuario autenticado', async () => {
      await controller.getMyPatient(DOCTOR);
      await controller.getMyPatientStatus(DOCTOR);

      expect(mockService.findMyPatient).toHaveBeenCalledWith('doctor-auth-1');
      expect(mockService.findMyPatientStatus).toHaveBeenCalledWith(
        'doctor-auth-1',
      );
    });

    it.each([
      ['findMedicalHistory', 'findMedicalHistory'],
      ['findHygieneHabits', 'findHygieneHabits'],
      ['findLatestClinicalExam', 'findLatestClinicalExam'],
      ['findOdontogramEntries', 'findOdontogramEntries'],
      ['findToothProcedures', 'findToothProcedures'],
      ['findDentalExamVersions', 'findDentalExamVersions'],
      ['findCurrentDentalExam', 'findCurrentDentalExam'],
    ] as const)(
      '%s pasa el id del paciente',
      async (handler, serviceMethod) => {
        mockService[serviceMethod].mockResolvedValue('resultado');

        await expect(controller[handler](PATIENT_ID)).resolves.toBe(
          'resultado',
        );
        expect(mockService[serviceMethod]).toHaveBeenCalledWith(PATIENT_ID);
      },
    );

    it('findDentalExam pasa paciente y examen', async () => {
      await controller.findDentalExam(PATIENT_ID, 'exam-1');

      expect(mockService.findDentalExam).toHaveBeenCalledWith(
        PATIENT_ID,
        'exam-1',
      );
    });
  });

  describe('createPatient', () => {
    const DTO = {
      userId: 'user-1',
      firstName: 'Ana',
      lastNamePaternal: 'Pérez',
      lastNameMaternal: 'Rojas',
      birthDate: '1990-05-01',
      birthPlace: 'La Paz',
      sex: 'F',
      occupation: 'Ingeniera',
      address: 'Av. Arce 100',
      zona: 'Sopocachi',
      ciudad: 'La Paz',
      phone: '+59170000000',
      emergencyContactName: 'Luis',
      emergencyContactPhone: '+59171111111',
      emergencyContactRelationship: 'Hermano',
      consultationReason: 'Control',
      lastDentistVisit: '2025-01-10',
      lastVisitTreatment: 'Limpieza',
      familyHistory: 'Diabetes',
      documentType: 'ci',
      dni: '1234567',
    } as CreatePatientDto;

    it('convierte las fechas y pasa el resto de los campos tal cual', async () => {
      await controller.createPatient(DOCTOR, DTO);

      expect(mockService.createPatient).toHaveBeenCalledWith(
        'doctor-auth-1',
        'user-1',
        {
          firstName: 'Ana',
          lastNamePaternal: 'Pérez',
          lastNameMaternal: 'Rojas',
          birthDate: new Date('1990-05-01'),
          birthPlace: 'La Paz',
          sex: 'F',
          occupation: 'Ingeniera',
          address: 'Av. Arce 100',
          zona: 'Sopocachi',
          ciudad: 'La Paz',
          phone: '+59170000000',
          emergencyContactName: 'Luis',
          emergencyContactPhone: '+59171111111',
          emergencyContactRelationship: 'Hermano',
          consultationReason: 'Control',
          lastDentistVisit: new Date('2025-01-10'),
          lastVisitTreatment: 'Limpieza',
          familyHistory: 'Diabetes',
          documentType: 'ci',
          dni: '1234567',
        },
      );
    });

    it('deja lastDentistVisit sin definir si no vino', async () => {
      await controller.createPatient(DOCTOR, {
        ...DTO,
        lastDentistVisit: undefined,
      });

      const [, , data] = mockService.createPatient.mock.calls[0] as [
        string,
        string,
        { lastDentistVisit?: Date },
      ];
      expect(data.lastDentistVisit).toBeUndefined();
    });
  });

  describe('updatePatient', () => {
    it('convierte las fechas que vienen y pasa el email', async () => {
      await controller.updatePatient(PATIENT_ID, {
        firstName: 'Ana',
        birthDate: '1990-05-01',
        lastDentistVisit: '2025-01-10',
        email: 'ana@example.com',
      });

      expect(mockService.updatePatient).toHaveBeenCalledWith(
        PATIENT_ID,
        expect.objectContaining({
          firstName: 'Ana',
          birthDate: new Date('1990-05-01'),
          lastDentistVisit: new Date('2025-01-10'),
          email: 'ana@example.com',
        }),
      );
    });

    it('un PATCH parcial deja las fechas y los demás campos sin definir', async () => {
      await controller.updatePatient(PATIENT_ID, {
        occupation: 'Docente',
      });

      const [, data] = mockService.updatePatient.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(data.occupation).toBe('Docente');
      expect(data.birthDate).toBeUndefined();
      expect(data.lastDentistVisit).toBeUndefined();
      expect(data.firstName).toBeUndefined();
    });
  });

  describe('upsertMedicalHistory', () => {
    it('convierte las fechas de condiciones, gestación y medicación', async () => {
      await controller.upsertMedicalHistory(PATIENT_ID, {
        conditions: [
          { code: 'diabetes', diagnosedAt: '2020-01-01', notes: 'tipo 2' },
          { code: 'asma' },
        ],
        otherDiseases: 'Ninguna',
        gestationLmpDate: '2026-06-01',
        anesthesiaReactions: 'No',
        medications: [
          {
            drugName: 'Metformina',
            dose: '500 mg',
            frequency: 'c/12 h',
            startedAt: '2021-03-01',
          },
          { drugName: 'Ibuprofeno' },
        ],
      } as unknown as CreateMedicalHistoryDto);

      expect(mockService.upsertMedicalHistory).toHaveBeenCalledWith(
        PATIENT_ID,
        {
          conditions: [
            {
              code: 'diabetes',
              diagnosedAt: new Date('2020-01-01'),
              notes: 'tipo 2',
            },
            { code: 'asma', diagnosedAt: undefined, notes: undefined },
          ],
          otherDiseases: 'Ninguna',
          gestationLmpDate: new Date('2026-06-01'),
          anesthesiaReactions: 'No',
          medications: [
            {
              drugName: 'Metformina',
              dose: '500 mg',
              frequency: 'c/12 h',
              startedAt: new Date('2021-03-01'),
            },
            {
              drugName: 'Ibuprofeno',
              dose: undefined,
              frequency: undefined,
              startedAt: undefined,
            },
          ],
        },
      );
    });

    it('sin condiciones, medicación ni gestación los deja sin definir', async () => {
      await controller.upsertMedicalHistory(PATIENT_ID, {});

      expect(mockService.upsertMedicalHistory).toHaveBeenCalledWith(
        PATIENT_ID,
        {
          conditions: undefined,
          otherDiseases: undefined,
          gestationLmpDate: undefined,
          anesthesiaReactions: undefined,
          medications: undefined,
        },
      );
    });
  });

  it('upsertHygieneHabits pasa los hábitos', async () => {
    const dto = {
      usesToothbrush: true,
      brushingFrequency: 2,
      usesDentalFloss: false,
      usesToothpick: false,
      brushesTongue: true,
      usesMouthwash: false,
    } as unknown as CreateHygieneHabitsDto;

    await controller.upsertHygieneHabits(PATIENT_ID, dto);

    expect(mockService.upsertHygieneHabits).toHaveBeenCalledWith(
      PATIENT_ID,
      dto,
    );
  });

  it('createClinicalExam pasa los hallazgos del examen', async () => {
    const dto = {
      tartar: 'leve',
      saburra: 'no',
      bacterialPlaque: 'moderada',
      halitosis: 'no',
      occlusion: 'normal',
    } as unknown as CreateClinicalExamDto;

    await controller.createClinicalExam(PATIENT_ID, dto);

    expect(mockService.createClinicalExam).toHaveBeenCalledWith(
      PATIENT_ID,
      dto,
    );
  });

  it('createOdontogramEntries mapea cada entry', async () => {
    const entry = {
      toothNumber: 11,
      toothType: 'permanent',
      toothCondition: 'caries',
      diagnosisDescription: 'Caries oclusal',
      treatmentId: 'treatment-1',
      customPrice: 150,
      notes: 'revisar',
    };

    await controller.createOdontogramEntries(PATIENT_ID, {
      entries: [entry],
    });

    expect(mockService.createOdontogramEntries).toHaveBeenCalledWith(
      PATIENT_ID,
      [entry],
    );
  });

  describe('createToothProcedure', () => {
    it('pasa dientes, precio y la fecha convertida, con el uid del doctor', async () => {
      await controller.createToothProcedure(PATIENT_ID, DOCTOR, {
        teeth: [{ number: 16, surfaces: ['occlusal'] }],
        treatmentId: 'treatment-1',
        priceCharged: 200,
        quantity: 1,
        procedureDate: '2026-09-20',
        notes: 'ok',
      });

      expect(mockService.createToothProcedure).toHaveBeenCalledWith(
        PATIENT_ID,
        'doctor-auth-1',
        {
          teeth: [{ number: 16, surfaces: ['occlusal'] }],
          treatmentId: 'treatment-1',
          priceCharged: 200,
          quantity: 1,
          procedureDate: new Date('2026-09-20'),
          notes: 'ok',
        },
      );
    });

    it('sin fecha de procedimiento la deja sin definir', async () => {
      await controller.createToothProcedure(PATIENT_ID, DOCTOR, {
        teeth: [{ number: 16 }],
        treatmentId: 'treatment-1',
      } as CreateToothProcedureDto);

      const [, , data] = mockService.createToothProcedure.mock.calls[0] as [
        string,
        string,
        { procedureDate?: Date; teeth: unknown[] },
      ];
      expect(data.procedureDate).toBeUndefined();
      expect(data.teeth).toEqual([{ number: 16, surfaces: undefined }]);
    });
  });

  it('createDentalExam mapea los hallazgos, el tipo y el motivo', async () => {
    const finding = {
      diagnosisCode: 'caries',
      toothNumbers: [16, 17],
      modifierValue: 'M',
      description: 'Caries interproximal',
      xrayRequested: true,
      notes: 'urgente',
    };

    await controller.createDentalExam(PATIENT_ID, DOCTOR, {
      findings: [finding],
      kind: 'diagnosis',
      changeReason: 'Nuevo control',
      notes: 'general',
    });

    expect(mockService.createDentalExam).toHaveBeenCalledWith(
      PATIENT_ID,
      'doctor-auth-1',
      {
        findings: [finding],
        kind: 'diagnosis',
        changeReason: 'Nuevo control',
        notes: 'general',
      },
    );
  });
});
