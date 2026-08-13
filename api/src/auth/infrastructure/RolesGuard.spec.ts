import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './RolesGuard';
import { User } from '../domain/User';
import { UserRole } from '../domain/value-objects/UserRole';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';

const authUser: AuthenticatedUser = {
  uid: AUTH_USER_ID,
  email: 'test@example.com',
  displayName: 'Test User',
  photoUrl: null,
};

function makeUser(role: UserRole): User {
  return new User(
    'user-1',
    AUTH_USER_ID,
    'test@example.com',
    role,
    'Test User',
    null,
    null,
    true,
    new Date(),
    new Date(),
  );
}

function contextWithReflectorMetadata(
  requiredRoles: UserRole[] | undefined,
  user?: AuthenticatedUser,
): {
  context: ExecutionContext;
  request: { user?: AuthenticatedUser; appUser?: User };
} {
  const request: { user?: AuthenticatedUser; appUser?: User } = user
    ? { user }
    : {};
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('RolesGuard', () => {
  const mockUserRepo = {
    findByAuthUserId: jest.fn(),
    upsertByAuthUserId: jest.fn(),
    createPlaceholder: jest.fn(),
    linkAuthIdentity: jest.fn(),
    updateContactInfo: jest.fn(),
  };
  const mockReflector = { getAllAndOverride: jest.fn() };
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(mockReflector as never, mockUserRepo);
  });

  it('passes through when no @Roles() metadata is present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const { context } = contextWithReflectorMetadata(undefined, authUser);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockUserRepo.findByAuthUserId).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException (not 401) when there is no authenticated request.user', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ODONTOLOGIST]);
    const { context } = contextWithReflectorMetadata([UserRole.ODONTOLOGIST]);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows and attaches appUser when the resolved role matches', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ODONTOLOGIST]);
    mockUserRepo.findByAuthUserId.mockResolvedValue(
      makeUser(UserRole.ODONTOLOGIST),
    );
    const { context, request } = contextWithReflectorMetadata(
      [UserRole.ODONTOLOGIST],
      authUser,
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.appUser?.role).toBe(UserRole.ODONTOLOGIST);
  });

  it('throws ForbiddenException when the resolved role does not match', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ODONTOLOGIST]);
    mockUserRepo.findByAuthUserId.mockResolvedValue(makeUser(UserRole.PATIENT));
    const { context } = contextWithReflectorMetadata(
      [UserRole.ODONTOLOGIST],
      authUser,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the authenticated user has no matching row in users', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([UserRole.ODONTOLOGIST]);
    mockUserRepo.findByAuthUserId.mockResolvedValue(null);
    const { context } = contextWithReflectorMetadata(
      [UserRole.ODONTOLOGIST],
      authUser,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
