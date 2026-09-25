import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { ChatActor } from '../domain/ChatActor';
import type { ChatTool } from '../domain/ChatTool';
import { TOOL_NAMES } from '../domain/toolPermissions';
import type { ToolName } from '../domain/toolPermissions';
import { ToolRegistry } from './tool-registry';

class NoArgs {}

function fakeTool(name: string): ChatTool {
  return {
    name: name as ToolName,
    description: name,
    parameters: { type: 'object', properties: {} },
    argsDto: NoArgs,
    execute: () => Promise.resolve({}),
  };
}

function userActor(role: UserRole): ChatActor {
  return { kind: 'user', userId: 'u1', role, patientId: null };
}

const sortedNames = (tools: ChatTool[]) =>
  tools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b));

describe('ToolRegistry', () => {
  const registry = new ToolRegistry(TOOL_NAMES.map(fakeTool));

  it('a un anónimo solo le da las tools públicas y el link de reserva', () => {
    expect(sortedNames(registry.forActor({ kind: 'anonymous' }))).toEqual([
      'get_available_slots',
      'get_booking_link',
      'get_clinic_info',
      'get_faq',
      'list_doctors',
      'list_services',
    ]);
  });

  it('a cada rol le da exactamente lo que dice la matriz', () => {
    const patientTools = sortedNames(
      registry.forActor(userActor(UserRole.PATIENT)),
    );
    const doctorTools = sortedNames(
      registry.forActor(userActor(UserRole.ODONTOLOGIST)),
    );
    const adminTools = sortedNames(
      registry.forActor(userActor(UserRole.ADMIN)),
    );

    expect(patientTools).toContain('get_my_balance');
    expect(patientTools).not.toContain('get_my_agenda');
    expect(doctorTools).toContain('get_my_agenda');
    expect(doctorTools).not.toContain('get_clinic_financial_report');
    expect(adminTools).toContain('get_clinic_financial_report');
    expect(adminTools).not.toContain('get_my_balance');
  });

  it('solo ofrece tools registradas (una tool de la matriz sin implementar no aparece)', () => {
    const partial = new ToolRegistry([fakeTool('get_clinic_info')]);

    expect(sortedNames(partial.forActor(userActor(UserRole.ADMIN)))).toEqual([
      'get_clinic_info',
    ]);
  });

  it('find devuelve la tool por nombre, o undefined', () => {
    expect(registry.find('get_faq')?.name).toBe('get_faq');
    expect(registry.find('query_database')).toBeUndefined();
  });

  it('no arranca con una tool que no está en la matriz de permisos', () => {
    expect(() => new ToolRegistry([fakeTool('query_database')])).toThrow(
      /no está en la matriz/,
    );
  });

  it('no arranca con una tool registrada dos veces', () => {
    expect(
      () => new ToolRegistry([fakeTool('get_faq'), fakeTool('get_faq')]),
    ).toThrow(/dos veces/);
  });
});
