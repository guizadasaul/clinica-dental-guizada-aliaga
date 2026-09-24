import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { actorRole, ANONYMOUS_ROLE } from './ChatActor';
import { ChatChannel } from './ChatChannel';

describe('actorRole', () => {
  it('returns anonymous for an anonymous actor', () => {
    expect(actorRole({ kind: 'anonymous' })).toBe(ANONYMOUS_ROLE);
  });

  it.each([UserRole.PATIENT, UserRole.ODONTOLOGIST, UserRole.ADMIN])(
    'returns the app role %s for a user actor',
    (role) => {
      expect(
        actorRole({ kind: 'user', userId: 'u1', role, patientId: null }),
      ).toBe(role);
    },
  );
});

describe('ChatChannel', () => {
  it('has the web and whatsapp channels', () => {
    expect(Object.values(ChatChannel)).toEqual(['web', 'whatsapp']);
  });
});
