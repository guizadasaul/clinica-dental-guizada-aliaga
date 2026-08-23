import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClinicalExamDto } from './create-clinical-exam.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_EXAM = {
  tartar: true,
  saburra: false,
  bacterialPlaque: true,
  halitosis: false,
  occlusion: 'Clase I de Angle',
};

async function validateExam(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateClinicalExamDto, {
    ...VALID_EXAM,
    ...overrides,
  });
  return validate(dto);
}

describe('CreateClinicalExamDto', () => {
  it('acepta un examen clínico válido', async () => {
    const errors = await validateExam({});
    expect(errors).toHaveLength(0);
  });

  it('acepta un examen vacío (todos los campos son opcionales)', async () => {
    const dto = plainToInstance(CreateClinicalExamDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('"" en occlusion se trata como no enviado (EmptyToUndefined)', async () => {
    const dto = plainToInstance(CreateClinicalExamDto, {
      ...VALID_EXAM,
      occlusion: '',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.occlusion).toBeUndefined();
  });

  it('rechaza occlusion más largo que 200 caracteres', async () => {
    const errors = await validateExam({ occlusion: 'a'.repeat(201) });
    expect(errors.some((e) => e.property === 'occlusion')).toBe(true);
  });

  it('rechaza HTML en occlusion', async () => {
    const errors = await validateExam({
      occlusion: '<script>alert(1)</script>',
    });
    expect(errors.some((e) => e.property === 'occlusion')).toBe(true);
  });

  // occlusion queda libre a propósito (decisión clínica) — no lleva @IsIn(),
  // así que cualquier texto corto sin HTML es válido, incluida esta forma
  // particular de payload de inyección.
  it('acepta un valor de occlusion parecido a SQL pero sin HTML (es texto libre)', async () => {
    const errors = await validateExam({ occlusion: "Clase II div. 1'" });
    expect(errors).toHaveLength(0);
  });

  // Los campos clínicos booleanos rechazan cualquier valor que no sea
  // booleano — incluidos los payloads de inyección clásicos.
  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en tartar (no es booleano)', async () => {
      const errors = await validateExam({ tartar: payload });
      expect(errors.some((e) => e.property === 'tartar')).toBe(true);
    });
  });
});
