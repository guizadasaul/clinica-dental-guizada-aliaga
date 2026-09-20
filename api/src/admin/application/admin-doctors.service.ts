import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminDoctorDetail,
  AdminDoctorSummary,
  CreateAdminDoctorData,
  UpdateAdminDoctorData,
} from '../domain/AdminDoctor';
import { AdminDoctorRepository } from '../domain/AdminDoctorRepository';
import type { IAdminDoctorRepository } from '../domain/AdminDoctorRepository';
import {
  CreateInviteResult,
  PatientInvitesService,
} from '../../patient-invites/application/patient-invites.service';

export interface CreateDoctorResult {
  doctor: AdminDoctorDetail;
}

@Injectable()
export class AdminDoctorsService {
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
   * Solo crea el doctor (users + doctor_profiles + doctor_schedule_blocks) y
   * lo deja pendiente y no reservable: la invitación se manda aparte
   * (inviteDoctor), por el canal que elija el admin — igual que con los
   * pacientes (CLI-77).
   */
  async createDoctor(data: CreateAdminDoctorData): Promise<CreateDoctorResult> {
    const doctor = await this.adminDoctorRepo.create(data);
    return { doctor };
  }

  /**
   * Manda (o reenvía) la invitación a un doctor que todavía no canjeó la
   * anterior. Reenviar invalida el link previo (lo hace PatientInvitesService).
   */
  async inviteDoctor(id: string, channel: string): Promise<CreateInviteResult> {
    const doctor = await this.findById(id);
    if (doctor.registrationStatus === 'active') {
      throw new ConflictException('El doctor ya se registró');
    }
    if (!doctor.isActive) {
      throw new ConflictException('El doctor está dado de baja');
    }
    return this.patientInvitesService.createInviteForUser(
      id,
      channel,
      {
        fullName: doctor.displayName ?? '',
        phone: doctor.phone,
        email: doctor.email,
      },
      'doctor',
    );
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
