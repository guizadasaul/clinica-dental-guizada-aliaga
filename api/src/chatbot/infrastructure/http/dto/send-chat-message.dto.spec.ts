import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  SendChatMessageDto,
  SendPublicChatMessageDto,
} from './send-chat-message.dto';

async function errorsOf(
  dtoClass: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(dtoClass, body);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('DTOs del chat', () => {
  it('acepta un mensaje válido y le recorta los espacios', async () => {
    const dto = plainToInstance(SendChatMessageDto, { message: '  hola  ' });

    expect(dto.message).toBe('hola');
    await expect(
      errorsOf(SendChatMessageDto, { message: 'hola' }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['demasiado largo', 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1)],
    ['con HTML', '<script>alert(1)</script>'],
    ['que no es texto', 42],
  ])('rechaza un mensaje %s', async (_label, message) => {
    await expect(errorsOf(SendChatMessageDto, { message })).resolves.toEqual([
      'message',
    ]);
  });

  it.each(['role', 'userId', 'patientId'])(
    'rechaza un %s en el body: la identidad sale solo del token',
    async (field) => {
      await expect(
        errorsOf(SendChatMessageDto, { message: 'hola', [field]: 'admin' }),
      ).resolves.toEqual([field]);
    },
  );

  it('exige que sessionId sea un UUID', async () => {
    await expect(
      errorsOf(SendChatMessageDto, { message: 'hola', sessionId: '1 OR 1=1' }),
    ).resolves.toEqual(['sessionId']);
  });

  it('solo acepta los idiomas de la app', async () => {
    await expect(
      errorsOf(SendChatMessageDto, { message: 'hola', locale: 'fr' }),
    ).resolves.toEqual(['locale']);
  });

  it('valida el formato del token de una conversación anónima', async () => {
    await expect(
      errorsOf(SendPublicChatMessageDto, {
        message: 'hola',
        sessionToken: 'a'.repeat(43),
      }),
    ).resolves.toEqual([]);
    await expect(
      errorsOf(SendPublicChatMessageDto, {
        message: 'hola',
        sessionToken: "x'; DROP TABLE chat_sessions;--",
      }),
    ).resolves.toEqual(['sessionToken']);
  });
});
