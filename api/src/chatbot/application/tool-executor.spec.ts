import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { ChatActor } from '../domain/ChatActor';
import type { ChatTool } from '../domain/ChatTool';
import type { LlmToolCall } from '../domain/LlmProvider';
import type { ToolName } from '../domain/toolPermissions';
import { ClassValidatorToolArgsValidator } from '../infrastructure/tools/class-validator-tool-args.validator';
import { IsIn } from 'class-validator';
import { ToolExecutor } from './tool-executor';
import { ToolRegistry } from './tool-registry';
import { ToolOutputWithLinks } from '../domain/ChatLink';

class NoArgs {}

class ScopeArgs {
  @IsIn(['upcoming', 'past'])
  scope!: string;
}

const patient: ChatActor = {
  kind: 'user',
  userId: 'user-1',
  role: UserRole.PATIENT,
  patientId: 'patient-1',
};
const anonymous: ChatActor = { kind: 'anonymous' };

function tool(
  name: string,
  execute: ChatTool['execute'],
  argsDto: new () => object = NoArgs,
): ChatTool & { execute: jest.Mock } {
  return {
    name: name as ToolName,
    description: `descripción de ${name}`,
    parameters: { type: 'object', properties: {} },
    argsDto,
    execute: jest.fn(execute),
  };
}

function call(name: string, argumentsJson = '{}'): LlmToolCall {
  return { id: 'c1', name, argumentsJson };
}

/** Lo que se logueó con warn, unido en un solo string. */
function warned(spy: jest.SpyInstance): string {
  return (spy.mock.calls as unknown[][])
    .map((args) => String(args[0]))
    .join('\n');
}

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

describe('ToolExecutor', () => {
  const originalEnv = process.env;
  const clinicInfo = tool('get_clinic_info', () =>
    Promise.resolve({ name: 'Clínica' }),
  );
  const myAppointments = tool(
    'get_my_appointments',
    (_actor, args) => Promise.resolve({ scope: (args as ScopeArgs).scope }),
    ScopeArgs,
  );
  const financialReport = tool('get_clinic_financial_report', () =>
    Promise.resolve({ collected: 1000 }),
  );
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  function executor(...extra: ChatTool[]) {
    return new ToolExecutor(
      new ToolRegistry([clinicInfo, myAppointments, financialReport, ...extra]),
      new ClassValidatorToolArgsValidator(),
    );
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CHAT_TOOL_TIMEOUT_MS'];
    delete process.env['CHAT_TOOL_RESULT_MAX_CHARS'];
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('definitionsFor devuelve nombre, descripción y schema de las tools permitidas', () => {
    expect(executor().definitionsFor(anonymous)).toEqual([
      {
        name: 'get_clinic_info',
        description: 'descripción de get_clinic_info',
        parameters: { type: 'object', properties: {} },
      },
    ]);
  });

  it('ejecuta una tool permitida y devuelve el resultado serializado', async () => {
    const result = await executor().execute(anonymous, call('get_clinic_info'));

    expect(result).toEqual({
      toolName: 'get_clinic_info',
      status: 'ok',
      content: JSON.stringify({ name: 'Clínica' }),
      links: [],
    });
  });

  it('le pasa a la tool el actor y los argumentos validados', async () => {
    const result = await executor().execute(
      patient,
      call('get_my_appointments', '{"scope":"past"}'),
    );

    expect(parse(result.content)).toEqual({ scope: 'past' });
    expect(myAppointments.execute).toHaveBeenCalledWith(
      patient,
      expect.objectContaining({ scope: 'past' }),
    );
  });

  it('acepta argumentos vacíos como objeto vacío', async () => {
    const result = await executor().execute(
      anonymous,
      call('get_clinic_info', ''),
    );

    expect(result.status).toBe('ok');
  });

  it('una tool inexistente devuelve unknown_tool', async () => {
    const result = await executor().execute(patient, call('query_database'));

    expect(result).toEqual({
      toolName: 'query_database',
      status: 'error',
      content: JSON.stringify({ error: 'unknown_tool' }),
      links: [],
    });
  });

  it('una tool no permitida NO se ejecuta y queda registrada como evento de seguridad', async () => {
    const result = await executor().execute(
      patient,
      call('get_clinic_financial_report', '{"from":"2026-01-01"}'),
    );

    expect(result.status).toBe('denied');
    expect(parse(result.content)).toEqual({ error: 'not_allowed' });
    expect(financialReport.execute).not.toHaveBeenCalled();
    const logged = warned(warnSpy);
    expect(logged).toContain('chat.security not_allowed');
    expect(logged).toContain('user:user-1');
    expect(logged).toContain('role=patient');
    // Nunca los argumentos del modelo.
    expect(logged).not.toContain('2026-01-01');
  });

  it('un anónimo que pide una tool de paciente queda denegado', async () => {
    const result = await executor().execute(
      anonymous,
      call('get_my_appointments', '{"scope":"upcoming"}'),
    );

    expect(result.status).toBe('denied');
    expect(myAppointments.execute).not.toHaveBeenCalled();
    expect(warned(warnSpy)).toContain('actor=anon');
  });

  it.each(['no es json', '[1,2]', 'null', '"texto"'])(
    'argumentos que no son un objeto JSON (%p) dan invalid_arguments',
    async (argumentsJson) => {
      const result = await executor().execute(
        patient,
        call('get_my_appointments', argumentsJson),
      );

      expect(parse(result.content)).toEqual({ error: 'invalid_arguments' });
      expect(myAppointments.execute).not.toHaveBeenCalled();
    },
  );

  it('rechaza un patientId inyectado en una tool "my" y lo registra como evento de seguridad', async () => {
    const result = await executor().execute(
      patient,
      call('get_my_appointments', '{"scope":"upcoming","patientId":"otro"}'),
    );

    expect(result.status).toBe('error');
    expect(parse(result.content)).toEqual({
      error: 'invalid_arguments',
      fields: ['patientId'],
    });
    expect(myAppointments.execute).not.toHaveBeenCalled();
    expect(warned(warnSpy)).toContain(
      'chat.security identity_field_in_arguments',
    );
  });

  it('un argumento con tipo o valor inválido da invalid_arguments sin evento de seguridad', async () => {
    const result = await executor().execute(
      patient,
      call('get_my_appointments', '{"scope":"todas"}'),
    );

    expect(parse(result.content)).toEqual({
      error: 'invalid_arguments',
      fields: ['scope'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    [new NotFoundException('Paciente con id 123 no encontrado'), 'not_found'],
    [new BadRequestException('Rango inválido'), 'invalid_request'],
  ])('traduce %p a un código genérico sin el mensaje', async (error, code) => {
    const failing = tool('get_faq', () => Promise.reject(error));

    const result = await executor(failing).execute(patient, call('get_faq'));

    expect(result).toEqual({
      toolName: 'get_faq',
      status: 'error',
      content: JSON.stringify({ error: code }),
      links: [],
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('un error inesperado da internal_error y el detalle queda solo en el log', async () => {
    const failing = tool('get_faq', () =>
      Promise.reject(new Error('connection refused 10.0.0.5:5432')),
    );

    const result = await executor(failing).execute(patient, call('get_faq'));

    expect(result.content).toBe(JSON.stringify({ error: 'internal_error' }));
    expect(result.content).not.toContain('10.0.0.5');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('corta una tool que tarda más que CHAT_TOOL_TIMEOUT_MS', async () => {
    process.env['CHAT_TOOL_TIMEOUT_MS'] = '20';
    const slow = tool(
      'list_doctors',
      () => new Promise((resolve) => setTimeout(() => resolve({}), 1_000)),
    );

    const result = await executor(slow).execute(
      anonymous,
      call('list_doctors'),
    );

    expect(parse(result.content)).toEqual({ error: 'timeout' });
  });

  it('trunca un resultado demasiado grande', async () => {
    process.env['CHAT_TOOL_RESULT_MAX_CHARS'] = '50';
    const big = tool('list_services', () =>
      Promise.resolve({ items: 'x'.repeat(500) }),
    );

    const result = await executor(big).execute(
      anonymous,
      call('list_services'),
    );
    const parsed = parse(result.content) as {
      truncated: boolean;
      partial: string;
    };

    expect(result.status).toBe('ok');
    expect(parsed.truncated).toBe(true);
    expect(parsed.partial).toHaveLength(50);
  });

  it('separa los links de una ToolOutputWithLinks: solo data va al modelo', async () => {
    const withLinks = tool('get_booking_link', () =>
      Promise.resolve(
        new ToolOutputWithLinks({ date: '2026-09-26', time: '10:00' }, [
          { label: 'Reservar', url: 'http://localhost:4200/reservar?x=1' },
        ]),
      ),
    );

    const result = await executor(withLinks).execute(
      anonymous,
      call('get_booking_link'),
    );

    expect(result).toEqual({
      toolName: 'get_booking_link',
      status: 'ok',
      content: JSON.stringify({ date: '2026-09-26', time: '10:00' }),
      links: [{ label: 'Reservar', url: 'http://localhost:4200/reservar?x=1' }],
    });
  });

  it('serializa un resultado undefined como null', async () => {
    const empty = tool('get_faq', () => Promise.resolve(undefined));

    const result = await executor(empty).execute(anonymous, call('get_faq'));

    expect(result.content).toBe('null');
  });
});
