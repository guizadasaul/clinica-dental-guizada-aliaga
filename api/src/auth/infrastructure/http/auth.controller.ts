import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from '../../application/auth.service.js';
import type { AuthenticatedUser } from '../../domain/AuthenticatedUser.js';
import { User } from '../../domain/User.js';
import { SupabaseAuthGuard } from '../SupabaseAuthGuard.js';
import { CurrentUser } from '../CurrentUserDecorator.js';

@Controller('auth')
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.syncUser(user);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.getCurrentUser(user.uid);
  }
}
