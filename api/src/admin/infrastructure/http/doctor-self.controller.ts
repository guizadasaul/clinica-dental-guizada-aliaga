import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminDoctorsService } from '../../application/admin-doctors.service.js';
import type { AdminDoctorDetail } from '../../domain/AdminDoctor.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import { User } from '../../../auth/domain/User.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { UpdateMyDoctorProfileDto } from './dto/update-my-doctor-profile.dto.js';

/**
 * Configuración del propio doctor (CLI-191). El id sale siempre de la sesión
 * (`appUser`), nunca de un parámetro: un doctor solo puede ver y editar lo
 * suyo. Reutiliza AdminDoctorsService (misma escritura que el administrador),
 * con un DTO más acotado.
 */
@Controller('doctors/me')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST)
export class DoctorSelfController {
  constructor(private readonly adminDoctorsService: AdminDoctorsService) {}

  @Get()
  findMine(@CurrentAppUser() user: User): Promise<AdminDoctorDetail> {
    return this.adminDoctorsService.findById(user.id);
  }

  @Patch()
  updateMine(
    @CurrentAppUser() user: User,
    @Body() dto: UpdateMyDoctorProfileDto,
  ): Promise<AdminDoctorDetail> {
    return this.adminDoctorsService.updateDoctor(user.id, {
      ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastNamePaternal !== undefined && {
        lastNamePaternal: dto.lastNamePaternal,
      }),
      ...(dto.lastNameMaternal !== undefined && {
        lastNameMaternal: dto.lastNameMaternal,
      }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.specialty !== undefined && { specialty: dto.specialty }),
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.color !== undefined && { color: dto.color.toLowerCase() }),
      ...(dto.scheduleBlocks !== undefined && {
        scheduleBlocks: dto.scheduleBlocks.map((block) => ({
          weekday: block.weekday,
          start: block.start,
          end: block.end,
        })),
      }),
    });
  }
}
