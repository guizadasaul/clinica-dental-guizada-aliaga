import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthGuard } from './SupabaseAuthGuard';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';

const mockVerifier = {
  verify: jest.fn(),
};

const authUser: AuthenticatedUser = {
  uid: '11111111-1111-4111-8111-111111111111',
  email: 'test@example.com',
  displayName: 'Test User',
  photoUrl: null,
};

function contextWithHeader(authorization?: string): ExecutionContext {
  const request: { headers: Record<string, string>; user?: AuthenticatedUser } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('SupabaseAuthGuard', () => {
  let guard: SupabaseAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new SupabaseAuthGuard(mockVerifier);
  });

  it('throws UnauthorizedException when no Authorization header is present', async () => {
    const context = contextWithHeader();

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(mockVerifier.verify).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the header is not a Bearer token', async () => {
    const context = contextWithHeader('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(mockVerifier.verify).not.toHaveBeenCalled();
  });

  it('propagates the verifier rejection for an invalid token', async () => {
    mockVerifier.verify.mockRejectedValue(new UnauthorizedException('Invalid or expired token'));
    const context = contextWithHeader('Bearer bad-token');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the verified user to the request and returns true for a valid token', async () => {
    mockVerifier.verify.mockResolvedValue(authUser);
    const context = contextWithHeader('Bearer good-token');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockVerifier.verify).toHaveBeenCalledWith('good-token');
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    expect(request.user).toEqual(authUser);
  });
});
