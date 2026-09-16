import { Controller, Get, Inject } from '@nestjs/common';
import { DoctorRepository } from '../../domain/DoctorRepository.js';
import type { IDoctorRepository } from '../../domain/DoctorRepository.js';
import type { Doctor } from '../../domain/Doctor.js';

// Sin guard a propósito, igual que AppointmentsController: el selector de
// doctor de la reserva pública (CLI-59) lo consume sin sesión.
@Controller('public')
export class DoctorsController {
  constructor(
    @Inject(DoctorRepository) private readonly doctorRepo: IDoctorRepository,
  ) {}

  @Get('doctors')
  findBookable(): Promise<Doctor[]> {
    return this.doctorRepo.findBookable();
  }
}
