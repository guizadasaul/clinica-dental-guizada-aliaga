import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AdminDoctorsService,
  CreateDoctorResult,
} from '../../application/admin-doctors.service.js';
import type { CreateInviteResult } from '../../../patient-invites/application/patient-invites.service.js';
import type {
  AdminDoctorDetail,
  AdminDoctorSummary,
} from '../../domain/AdminDoctor.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';
import { CreateInviteDto } from '../../../patient-invites/infrastructure/http/dto/create-invite.dto.js';

// Toda la ruta es exclusiva de admin (CLI-63) — a diferencia de
// PatientsController (mezcla rutas por-rol método a método), acá conviene
// @Roles a nivel de clase: no hay ninguna ruta de este controller que un
// odontólogo o paciente deba poder tocar.
@Controller('admin/doctors')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDoctorsController {
  constructor(private readonly adminDoctorsService: AdminDoctorsService) {}

  @Get()
  findAll(): Promise<AdminDoctorSummary[]> {
    return this.adminDoctorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminDoctorDetail> {
    return this.adminDoctorsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDoctorDto): Promise<CreateDoctorResult> {
    return this.adminDoctorsService.createDoctor({
      displayName: dto.displayName,
      firstName: dto.firstName,
      lastNamePaternal: dto.lastNamePaternal,
      lastNameMaternal: dto.lastNameMaternal ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      specialty: dto.specialty ?? null,
      bio: dto.bio ?? null,
      photoUrl: dto.photoUrl ?? null,
      displayOrder: dto.displayOrder ?? null,
      scheduleBlocks: dto.scheduleBlocks.map((block) => ({
        weekday: block.weekday,
        start: block.start,
        end: block.end,
      })),
    });
  }

  // Mismo mecanismo que POST /patients/:id/invites, pero el que invita es el
  // admin y el invitado es un doctor (CLI-77). Sirve tanto para la primera
  // invitación como para reenviarla.
  @Post(':id/invites')
  @HttpCode(HttpStatus.CREATED)
  createInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInviteDto,
  ): Promise<CreateInviteResult> {
    return this.adminDoctorsService.inviteDoctor(id, dto.channel);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorDto,
  ): Promise<AdminDoctorDetail> {
    return this.adminDoctorsService.updateDoctor(id, {
      ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastNamePaternal !== undefined && {
        lastNamePaternal: dto.lastNamePaternal,
      }),
      ...(dto.lastNameMaternal !== undefined && {
        lastNameMaternal: dto.lastNameMaternal,
      }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.specialty !== undefined && { specialty: dto.specialty }),
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
      ...(dto.displayOrder !== undefined && {
        displayOrder: dto.displayOrder,
      }),
      ...(dto.isBookable !== undefined && { isBookable: dto.isBookable }),
      ...(dto.scheduleBlocks !== undefined && {
        scheduleBlocks: dto.scheduleBlocks.map((block) => ({
          weekday: block.weekday,
          start: block.start,
          end: block.end,
        })),
      }),
    });
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminDoctorDetail> {
    return this.adminDoctorsService.deactivateDoctor(id);
  }
}
