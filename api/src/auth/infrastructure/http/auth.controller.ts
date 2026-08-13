import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../../application/auth.service.js';
import type { AuthenticatedUser } from '../../domain/AuthenticatedUser.js';
import { User } from '../../domain/User.js';
import { SupabaseAuthGuard } from '../SupabaseAuthGuard.js';
import { CurrentUser } from '../CurrentUserDecorator.js';
import { SyncUserDto } from './dto/sync-user.dto.js';

@Controller('auth')
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncUserDto,
  ): Promise<User> {
    return this.authService.syncUser(user, dto?.inviteToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.getCurrentUser(user.uid);
  }
}
