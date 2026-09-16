import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../domain/User';
import type { AuthenticatedRequestWithAppUser } from './RolesGuard';

// A diferencia de @CurrentUser() (request.user, solo el uid del JWT de
// Supabase), esto lee request.appUser — el User de dominio (con role e id
// real de la tabla users) que RolesGuard deja seteado. Solo usable en rutas
// que ya tienen @UseGuards(SupabaseAuthGuard, RolesGuard) + @Roles(...),
// igual que DoctorAppointmentsController (CLI-57).
export const CurrentAppUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx
      .switchToHttp()
      .getRequest<AuthenticatedRequestWithAppUser>();
    return request.appUser;
  },
);
