import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PatientInvite } from '../../domain/PatientInvite.js';
import {
  CreateInviteData,
  InviteTokenStatus,
  IPatientInviteRepository,
  PatientContactInfo,
  RedeemedInvite,
} from '../../domain/PatientInviteRepository.js';

@Injectable()
export class PrismaPatientInviteRepository implements IPatientInviteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateInviteData): Promise<PatientInvite> {
    const record = await this.prisma.patient_invites.create({
      data: {
        user_id: data.userId,
        patient_id: data.patientId ?? null,
        channel: data.channel,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
      },
    });
    return new PatientInvite(
      record.id,
      record.user_id,
      record.patient_id,
      record.channel,
      record.expires_at,
      record.used_at,
      record.created_at,
    );
  }

  async invalidatePendingForUser(userId: string, now: Date): Promise<void> {
    await this.prisma.patient_invites.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: now },
    });
  }

  async redeemByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<RedeemedInvite | null> {
    return this.prisma.transaction(async (tx) => {
      const claimed = await tx.patient_invites.updateMany({
        where: {
          token_hash: tokenHash,
          used_at: null,
          expires_at: { gt: now },
        },
        data: { used_at: now },
      });
      if (claimed.count === 0) {
        return null;
      }

      const invite = await tx.patient_invites.findUnique({
        where: { token_hash: tokenHash },
      });
      if (!invite) {
        return null;
      }
      const { user_id: userId, patient_id: patientId } = invite;

      // Un invite se canjeó — invalida cualquier otro invite pendiente del
      // mismo user (ej. mandado también por el otro canal).
      await tx.patient_invites.updateMany({
        where: { user_id: userId, used_at: null },
        data: { used_at: now },
      });

      return { userId, patientId };
    });
  }

  async findPatientContactInfo(
    patientId: string,
  ): Promise<PatientContactInfo | null> {
    const patient = await this.prisma.patients.findUnique({
      where: { id: patientId },
      include: { users: true },
    });
    if (!patient) {
      return null;
    }
    return {
      userId: patient.user_id,
      fullName: [
        patient.first_name,
        patient.last_name_paternal,
        patient.last_name_maternal,
      ]
        .filter(Boolean)
        .join(' '),
      phone: patient.users.phone,
      email: patient.users.email,
    };
  }

  async findTokenStatus(
    tokenHash: string,
    now: Date,
  ): Promise<InviteTokenStatus | null> {
    const record = await this.prisma.patient_invites.findUnique({
      where: { token_hash: tokenHash },
      select: {
        used_at: true,
        expires_at: true,
        users: { select: { role: true, phone: true } },
      },
    });
    if (!record) {
      return null;
    }
    return {
      valid:
        record.used_at === null && record.expires_at.getTime() > now.getTime(),
      // Solo el paciente ve la landing de paciente; cualquier otro rol
      // (odontólogo, y el admin que se invita con el mismo mecanismo) entra al equipo.
      kind: record.users.role === 'patient' ? 'patient' : 'doctor',
      phone: record.users.phone,
    };
  }
}
