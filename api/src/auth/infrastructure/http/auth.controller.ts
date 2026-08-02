import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from '../../application/auth.service.js';
import type { AuthenticatedUser } from '../../domain/AuthenticatedUser.js';
import { User } from '../../domain/User.js';
import { FirebaseAuthGuard } from '../FirebaseAuthGuard.js';
import { CurrentUser } from '../CurrentUserDecorator.js';
import { SyncUserDto } from './dto/sync-user.dto.js';

@Controller('auth')
@UseGuards(FirebaseAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncUserDto,
  ): Promise<User> {
    return this.authService.syncUser(user, dto.phone);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.getCurrentUser(user.uid);
  }
}
