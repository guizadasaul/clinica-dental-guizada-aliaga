// @Type() (class-transformer, usado por CreateDentalExamDto.findings para el
// ValidateNested anidado) necesita el polyfill de Reflect.metadata ya
// cargado al momento de decorar la clase. La app real lo carga vía
// @nestjs/core al bootstrapear (main.ts); este spec no pasa por ahí, así
// que hay que importarlo a mano antes del resto.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDentalExamDto } from './create-dental-exam.dto';

const VALID_FINDING = {
  diagnosisCode: 'caries_segundo_grado',
  toothNumbers: [16],
  modifierValue: 'clase_ii',
  description: 'Caries oclusal',
};

async function validateExam(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(CreateDentalExamDto, {
    findings: [VALID_FINDING],
    ...overrides,
  });
  return validate(dto);
}

function flatten(
  errors: Awaited<ReturnType<typeof validate>>,
): { property: string; parent: string }[] {
  const out: { property: string; parent: string }[] = [];
  for (const e of errors) {
    if (e.constraints) {
      out.push({ property: e.property, parent: '' });
    }
    for (const child of e.children ?? []) {
      if (child.constraints) {
        out.push({ property: child.property, parent: e.property });
      }
      for (const grandchild of child.children ?? []) {
        if (grandchild.constraints) {
          out.push({ property: grandchild.property, parent: child.property });
        }
      }
    }
  }
  return out;
}

describe('CreateDentalExamDto', () => {
  it('acepta un examen válido', async () => {
    const errors = await validateExam();
    expect(errors).toHaveLength(0);
  });

  it('acepta un examen sin findings (boca sana)', async () => {
    const errors = await validateExam({ findings: [] });
    expect(errors).toHaveLength(0);
  });

  it('acepta un finding general sin toothNumbers', async () => {
    const errors = await validateExam({
      findings: [
        { diagnosisCode: 'lesion_lengua', description: 'Lesión visible' },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza toothNumbers vacío cuando viene el array', async () => {
    const errors = await validateExam({
      findings: [{ ...VALID_FINDING, toothNumbers: [] }],
    });
    expect(flatten(errors).some((e) => e.property === 'toothNumbers')).toBe(
      true,
    );
  });

  it('rechaza un número de diente fuera de la numeración FDI', async () => {
    const errors = await validateExam({
      findings: [{ ...VALID_FINDING, toothNumbers: [99] }],
    });
    expect(flatten(errors).some((e) => e.property === 'toothNumbers')).toBe(
      true,
    );
  });

  it('rechaza dientes repetidos dentro del mismo finding', async () => {
    const errors = await validateExam({
      findings: [{ ...VALID_FINDING, toothNumbers: [16, 16] }],
    });
    expect(flatten(errors).some((e) => e.property === 'toothNumbers')).toBe(
      true,
    );
  });

  it('rechaza un modifierValue fuera del enum cerrado', async () => {
    const errors = await validateExam({
      findings: [{ ...VALID_FINDING, modifierValue: 'clase_vi' }],
    });
    expect(flatten(errors).some((e) => e.property === 'modifierValue')).toBe(
      true,
    );
  });

  it('acepta un grado de movilidad como modifierValue', async () => {
    const errors = await validateExam({
      findings: [
        {
          diagnosisCode: 'movilidad_dental',
          toothNumbers: [21],
          modifierValue: 'grado_ii',
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza HTML en description', async () => {
    const errors = await validateExam({
      findings: [
        { ...VALID_FINDING, description: '<script>alert(1)</script>' },
      ],
    });
    expect(flatten(errors).some((e) => e.property === 'description')).toBe(
      true,
    );
  });

  it('rechaza HTML en notes', async () => {
    const errors = await validateExam({
      findings: [{ ...VALID_FINDING, notes: '<img src=x onerror=alert(1)>' }],
    });
    expect(flatten(errors).some((e) => e.property === 'notes')).toBe(true);
  });

  it('rechaza changeReason demasiado corto', async () => {
    const errors = await validateExam({ changeReason: 'ok' });
    expect(errors.some((e) => e.property === 'changeReason')).toBe(true);
  });

  it('acepta changeReason ausente (primera versión del examen)', async () => {
    const errors = await validateExam();
    expect(errors).toHaveLength(0);
  });
});
