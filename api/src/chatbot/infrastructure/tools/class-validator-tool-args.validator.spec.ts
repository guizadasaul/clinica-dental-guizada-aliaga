import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';

class SampleArgs {
  @IsIn(['upcoming', 'past'])
  scope!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

describe('ClassValidatorToolArgsValidator', () => {
  const validator = new ClassValidatorToolArgsValidator();

  it('acepta argumentos válidos y devuelve la instancia del DTO', async () => {
    const result = await validator.validate(SampleArgs, {
      scope: 'upcoming',
      limit: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeInstanceOf(SampleArgs);
    expect(result.ok && result.value).toMatchObject({
      scope: 'upcoming',
      limit: 3,
    });
  });

  it('rechaza propiedades no declaradas (un patientId inyectado)', async () => {
    const result = await validator.validate(SampleArgs, {
      scope: 'upcoming',
      patientId: 'otro-paciente',
    });

    expect(result).toEqual({ ok: false, fields: ['patientId'] });
  });

  it('rechaza tipos inválidos sin convertirlos implícitamente', async () => {
    const result = await validator.validate(SampleArgs, {
      scope: 'upcoming',
      limit: '3',
    });

    expect(result).toEqual({ ok: false, fields: ['limit'] });
  });

  it('una tool sin argumentos acepta un objeto vacío y rechaza cualquier campo', async () => {
    class NoArgs {}

    await expect(validator.validate(NoArgs, {})).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      validator.validate(NoArgs, { userId: 'alguien' }),
    ).resolves.toEqual({ ok: false, fields: ['userId'] });
  });

  it('informa solo nombres de campo, nunca los valores', async () => {
    const result = await validator.validate(SampleArgs, {
      scope: 'DROP TABLE patients',
    });

    expect(result).toEqual({ ok: false, fields: ['scope'] });
    expect(JSON.stringify(result)).not.toContain('DROP');
  });
});
