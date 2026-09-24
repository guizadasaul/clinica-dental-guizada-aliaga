import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { ChatActor } from '../domain/ChatActor';
import { SystemPromptBuilder } from './system-prompt.builder';

// 23:30 UTC = 19:30 del mismo día en La Paz (UTC-4, sin horario de verano).
const NOW = new Date('2026-09-24T23:30:00Z');

function userActor(role: UserRole): ChatActor {
  return { kind: 'user', userId: 'user-123', role, patientId: 'patient-456' };
}

describe('SystemPromptBuilder', () => {
  const builder = new SystemPromptBuilder();

  it('incluye la fecha y hora en el huso de la clínica', () => {
    const prompt = builder.build({ kind: 'anonymous' }, NOW);

    expect(prompt).toContain('jueves');
    expect(prompt).toContain('24 de septiembre de 2026');
    expect(prompt).toContain('19:30');
  });

  it.each([
    [{ kind: 'anonymous' }, 'visitante'],
    [userActor(UserRole.PATIENT), 'paciente'],
    [userActor(UserRole.ODONTOLOGIST), 'odontólogo'],
    [userActor(UserRole.ADMIN), 'administrador'],
  ])('toma el tipo de usuario del actor', (actor, label) => {
    expect(builder.build(actor, NOW)).toContain(`Tipo de usuario: ${label}`);
  });

  it('no incluye ids ni datos del usuario', () => {
    const prompt = builder.build(userActor(UserRole.PATIENT), NOW);

    expect(prompt).not.toContain('user-123');
    expect(prompt).not.toContain('patient-456');
  });
});
