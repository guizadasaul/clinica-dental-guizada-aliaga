import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';

export const CHAT_MESSAGE_MAX_LENGTH = 1000;
const CHAT_LOCALES = ['es', 'en', 'pt'];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Campos comunes a los dos canales HTTP (autenticado y anónimo). */
abstract class ChatMessageFieldsDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_MESSAGE_MAX_LENGTH)
  @NoHtml()
  message!: string;

  /** Idioma de la UI, para el mensaje de fallback. */
  @IsOptional()
  @IsIn(CHAT_LOCALES)
  locale?: 'es' | 'en' | 'pt';
}

/**
 * POST /chat/messages. forbidNonWhitelisted (ValidationPipe global) hace que
 * un `role`, `userId` o `patientId` en el body sea un 400: la identidad sale
 * solo del token.
 */
export class SendChatMessageDto extends ChatMessageFieldsDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

/** POST /public/chat/messages. El token lo emite el servidor (base64url de 32 bytes). */
export class SendPublicChatMessageDto extends ChatMessageFieldsDto {
  @IsOptional()
  @Matches(/^[\w-]{20,64}$/, { message: 'sessionToken inválido' })
  sessionToken?: string;
}
