import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AdminDoctorDetail,
  AdminDoctorSummary,
  CreateAdminDoctorData,
  UpdateAdminDoctorData,
} from '../domain/AdminDoctor';
import { AdminDoctorRepository } from '../domain/AdminDoctorRepository';
import type { IAdminDoctorRepository } from '../domain/AdminDoctorRepository';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';

export interface CreateDoctorResult {
  doctor: AdminDoctorDetail;
  /** false si el doctor se creó bien pero el envío del email de invitación falló (ver createDoctor). */
  inviteSent: boolean;
}

@Injectable()
export class AdminDoctorsService {
  private readonly logger = new Logger(AdminDoctorsService.name);

  constructor(
    @Inject(AdminDoctorRepository)
    private readonly adminDoctorRepo: IAdminDoctorRepository,
    private readonly patientInvitesService: PatientInvitesService,
  ) {}

  findAll(): Promise<AdminDoctorSummary[]> {
    return this.adminDoctorRepo.findAll();
  }

  async findById(id: string): Promise<AdminDoctorDetail> {
    const doctor = await this.adminDoctorRepo.findById(id);
    if (!doctor) {
      throw new NotFoundException('Doctor no encontrado');
    }
    return doctor;
  }

  /**
   * El alta del doctor (users + doctor_profiles + doctor_schedule_blocks) y
   * el envío del email de invitación son dos pasos separados a propósito: el
   * segundo va FUERA de la transacción del repo — si Resend falla
   * transitoriamente no hay que revertir el alta ni bloquear al admin, solo
   * avisarle que reintente la invitación (inviteSent: false).
   */
  async createDoctor(data: CreateAdminDoctorData): Promise<CreateDoctorResult> {
    const doctor = await this.adminDoctorRepo.create(data);
    let inviteSent = true;
    try {
      await this.patientInvitesService.createInviteForUser(
        doctor.id,
        'email',
        {
          fullName: doctor.displayName ?? '',
          phone: doctor.phone,
          email: doctor.email,
        },
        'doctor',
      );
    } catch (error) {
      this.logger.error(
        'Doctor creado pero falló el envío de la invitación',
        error,
      );
      inviteSent = false;
    }
    return { doctor, inviteSent };
  }

  async updateDoctor(
    id: string,
    data: UpdateAdminDoctorData,
  ): Promise<AdminDoctorDetail> {
    const doctor = await this.adminDoctorRepo.update(id, data);
    if (!doctor) {
      throw new NotFoundException('Doctor no encontrado');
    }
    return doctor;
  }

  async deactivateDoctor(id: string): Promise<AdminDoctorDetail> {
    const doctor = await this.adminDoctorRepo.deactivate(id);
    if (!doctor) {
      throw new NotFoundException('Doctor no encontrado');
    }
    return doctor;
  }
}
