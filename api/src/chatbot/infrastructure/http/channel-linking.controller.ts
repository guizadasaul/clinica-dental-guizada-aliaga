import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type { User } from '../../../auth/domain/User.js';
import { readEnvInt } from '../../../shared/env.util.js';
import { ChannelLinkingService } from '../../application/channel-linking.service.js';
import type {
  ChannelLinkView,
  LinkCodeIssued,
} from '../../application/channel-linking.service.js';

const HOUR_MS = 60 * 60_000;

/**
 * Vinculación de WhatsApp desde la web (CLI-100): pide el código con la
 * sesión de Supabase, lista y desvincula. El canje del código lo hace el
 * adaptador de WhatsApp (CLI-101) con el mensaje enviado desde el número.
 */
@Controller('chat/channel-links')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT, UserRole.ODONTOLOGIST, UserRole.ADMIN)
export class ChannelLinkingController {
  constructor(private readonly linking: ChannelLinkingService) {}

  @Post('whatsapp')
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_CHAT_LINK_CODES_PER_HOUR', 10),
      ttl: HOUR_MS,
    },
  })
  requestWhatsappCode(
    @CurrentAppUser() appUser: User,
  ): Promise<LinkCodeIssued> {
    return this.linking.requestCode(appUser.id, 'whatsapp');
  }

  @Get()
  list(@CurrentAppUser() appUser: User): Promise<ChannelLinkView[]> {
    return this.linking.listLinks(appUser.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(
    @CurrentAppUser() appUser: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.linking.unlink(appUser.id, id);
  }
}
