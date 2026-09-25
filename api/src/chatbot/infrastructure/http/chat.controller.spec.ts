import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { User } from '../../../auth/domain/User';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { ActorResolver } from '../../application/actor-resolver';
import type { ChatService } from '../../application/chat.service';
import { ChatController } from './chat.controller';
import { PublicChatController } from './public-chat.controller';

const NOW = new Date('2026-09-24T12:00:00Z');

function throttleLimit(controller: object, handler: string): () => number {
  return Reflect.getMetadata(
    `${THROTTLER_LIMIT}default`,
    Reflect.get(controller, handler) as object,
  ) as () => number;
}
const appUser = new User(
  'user-1',
  'auth-1',
  'a@b.com',
  UserRole.PATIENT,
  'Ana',
  null,
  null,
  true,
  NOW,
  NOW,
);
const patientActor = {
  kind: 'user' as const,
  userId: 'user-1',
  role: UserRole.PATIENT,
  patientId: 'patient-1',
};

describe('chat controllers', () => {
  const chatService = {
    handleMessage: jest.fn(),
    deleteSession: jest.fn(),
    deleteAllSessions: jest.fn(),
  };
  const actorResolver = {
    fromAppUser: jest.fn(),
    anonymous: jest.fn(() => ({ kind: 'anonymous' as const })),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('ChatController', () => {
    const controller = new ChatController(
      chatService as unknown as ChatService,
      actorResolver as unknown as ActorResolver,
    );

    it('resuelve el actor desde el usuario autenticado y pasa el mensaje por el canal web', async () => {
      actorResolver.fromAppUser.mockResolvedValue(patientActor);
      chatService.handleMessage.mockResolvedValue({
        sessionId: 'session-1',
        anonToken: null,
        reply: 'Hola Ana',
      });

      await expect(
        controller.sendMessage(appUser, {
          sessionId: 'session-1',
          message: 'hola',
          locale: 'es',
        }),
      ).resolves.toEqual({ sessionId: 'session-1', reply: 'Hola Ana' });
      expect(actorResolver.fromAppUser).toHaveBeenCalledWith(appUser);
      expect(chatService.handleMessage).toHaveBeenCalledWith({
        actor: patientActor,
        channel: 'web',
        sessionId: 'session-1',
        text: 'hola',
        locale: 'es',
      });
    });

    it('borra una conversación propia', async () => {
      await controller.deleteSession(appUser, 'session-1');

      expect(chatService.deleteSession).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );
    });

    it('borra todas las conversaciones propias', async () => {
      await controller.deleteAllSessions(appUser);

      expect(chatService.deleteAllSessions).toHaveBeenCalledWith('user-1');
    });
  });

  describe('PublicChatController', () => {
    const controller = new PublicChatController(
      chatService as unknown as ChatService,
      actorResolver as unknown as ActorResolver,
    );

    it('siempre usa un actor anónimo y devuelve el token de la conversación', async () => {
      chatService.handleMessage.mockResolvedValue({
        sessionId: 'session-9',
        anonToken: 'token-nuevo',
        reply: 'Atendemos de lunes a sábado',
      });

      await expect(
        controller.sendMessage({
          message: '¿horarios?',
          sessionToken: 'token-viejo',
        }),
      ).resolves.toEqual({
        sessionToken: 'token-nuevo',
        reply: 'Atendemos de lunes a sábado',
      });
      expect(chatService.handleMessage).toHaveBeenCalledWith({
        actor: { kind: 'anonymous' },
        channel: 'web',
        anonToken: 'token-viejo',
        text: '¿horarios?',
        locale: undefined,
      });
    });

    it('nunca expone el id interno de la conversación', async () => {
      chatService.handleMessage.mockResolvedValue({
        sessionId: 'session-9',
        anonToken: null,
        reply: 'ok',
      });

      const response = await controller.sendMessage({ message: 'hola' });

      expect(response).toEqual({ sessionToken: '', reply: 'ok' });
      expect(JSON.stringify(response)).not.toContain('session-9');
    });
  });

  describe('rate limit', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it.each([
      [ChatController.prototype, 'THROTTLE_CHAT_USER_PER_MINUTE', 10],
      [PublicChatController.prototype, 'THROTTLE_CHAT_PUBLIC_PER_HOUR', 30],
    ])(
      'usa %p con default y override por %s',
      (prototype, envName, fallback) => {
        process.env = { ...originalEnv };
        delete process.env[envName];
        const limit = throttleLimit(prototype, 'sendMessage');

        expect(limit()).toBe(fallback);
        process.env[envName] = '3';
        expect(limit()).toBe(3);
      },
    );
  });
});
