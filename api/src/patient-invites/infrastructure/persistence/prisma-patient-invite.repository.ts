import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PatientInvite } from '../../domain/PatientInvite.js';
import {
  CreateInviteData,
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
        patient_id: data.patientId,
        channel: data.channel,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
      },
    });
    return new PatientInvite(
      record.id,
      record.patient_id,
      record.channel,
      record.expires_at,
      record.used_at,
      record.created_at,
    );
  }

  async invalidatePendingForPatient(
    patientId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.patient_invites.updateMany({
      where: { patient_id: patientId, used_at: null },
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
      const patientId = invite.patient_id;

      // Un invite se canjeó — invalida cualquier otro invite pendiente del
      // mismo patient (ej. mandado también por el otro canal).
      await tx.patient_invites.updateMany({
        where: { patient_id: patientId, used_at: null },
        data: { used_at: now },
      });

      const patient = await tx.patients.findUnique({
        where: { id: patientId },
      });
      if (!patient) {
        return null;
      }
      return { patientId, userId: patient.user_id };
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
      phone: patient.phone,
      email: patient.users.email,
    };
  }

  async isTokenValid(tokenHash: string, now: Date): Promise<boolean> {
    const count = await this.prisma.patient_invites.count({
      where: { token_hash: tokenHash, used_at: null, expires_at: { gt: now } },
    });
    return count > 0;
  }
}
