import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './CurrentUserDecorator';
import { CurrentAppUser } from './CurrentAppUserDecorator';

type Factory = (data: unknown, ctx: ExecutionContext) => unknown;

// Nest guarda la función del decorador en la metadata del parámetro; se
// extrae para probarla con un request armado a mano.
function factoryOf(decorator: () => ParameterDecorator): Factory {
  class Probe {
    handler(@decorator() value: unknown): unknown {
      return value;
    }
  }
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    Probe,
    'handler',
  ) as Record<string, { factory: Factory }>;
  return Object.values(args)[0].factory;
}

function contextWith(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('decoradores de parámetro de auth', () => {
  const request = {
    user: { uid: 'auth-1' },
    appUser: { id: 'user-1', role: 'odontologist' },
  };

  it('@CurrentUser() devuelve el usuario del JWT (request.user)', () => {
    expect(factoryOf(CurrentUser)(undefined, contextWith(request))).toBe(
      request.user,
    );
  });

  it('@CurrentAppUser() devuelve el usuario de la app que dejó RolesGuard', () => {
    expect(factoryOf(CurrentAppUser)(undefined, contextWith(request))).toBe(
      request.appUser,
    );
  });
});
