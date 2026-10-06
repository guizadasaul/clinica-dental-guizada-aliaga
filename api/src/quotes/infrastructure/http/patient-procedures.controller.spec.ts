import { PatientProceduresController } from './patient-procedures.controller';
import type { TreatmentPlanService } from '../../application/treatment-plan.service';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser';
import type { CreateToothProcedureDto } from '../../../patients/infrastructure/http/dto/create-tooth-procedure.dto';

const DOCTOR = { uid: 'doctor-auth-1' } as AuthenticatedUser;
const PATIENT_ID = 'patient-1';

describe('PatientProceduresController (CLI-226)', () => {
  const treatmentPlan = { registerProcedure: jest.fn() };
  let controller: PatientProceduresController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PatientProceduresController(
      treatmentPlan as unknown as TreatmentPlanService,
    );
  });

  it('pasa dientes, precio y la fecha convertida, con el uid del doctor', async () => {
    await controller.create(PATIENT_ID, DOCTOR, {
      teeth: [{ number: 16, surfaces: ['occlusal'] }],
      treatmentId: 'treatment-1',
      priceCharged: 200,
      quantity: 1,
      procedureDate: '2026-09-20',
      notes: 'ok',
    });

    expect(treatmentPlan.registerProcedure).toHaveBeenCalledWith(
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
    await controller.create(PATIENT_ID, DOCTOR, {
      teeth: [{ number: 16 }],
      treatmentId: 'treatment-1',
    } as CreateToothProcedureDto);

    const [, , data] = treatmentPlan.registerProcedure.mock.calls[0] as [
      string,
      string,
      { procedureDate?: Date; teeth: unknown[] },
    ];
    expect(data.procedureDate).toBeUndefined();
    expect(data.teeth).toEqual([{ number: 16, surfaces: undefined }]);
  });
});
