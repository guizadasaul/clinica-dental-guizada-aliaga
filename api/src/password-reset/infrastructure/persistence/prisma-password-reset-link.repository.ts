import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  IPasswordResetLinkRepository,
  PatientAccount,
  RedeemedResetLink,
  ResetLinkStatus,
} from '../../domain/PasswordResetLinkRepository.js';

@Injectable()
export class PrismaPasswordResetLinkRepository implements IPasswordResetLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPatientAccount(patientId: string): Promise<PatientAccount | null> {
    const patient = await this.prisma.patients.findFirst({
      where: { id: patientId, deleted_at: null },
      include: { users: true },
    });
    if (!patient) {
      return null;
    }
    return {
      userId: patient.user_id,
      authUserId: patient.users.auth_user_id,
      fullName: [
        patient.first_name,
        patient.last_name_paternal,
        patient.last_name_maternal,
      ]
        .filter(Boolean)
        .join(' '),
      phone: patient.users.phone,
    };
  }

  async replaceForUser(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      await tx.password_reset_links.updateMany({
        where: { user_id: userId, used_at: null },
        data: { used_at: now },
      });
      await tx.password_reset_links.create({
        data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt },
      });
    });
  }

  async findStatus(
    tokenHash: string,
    now: Date,
  ): Promise<ResetLinkStatus | null> {
    const record = await this.prisma.password_reset_links.findUnique({
      where: { token_hash: tokenHash },
      select: {
        used_at: true,
        expires_at: true,
        users: { select: { phone: true } },
      },
    });
    if (!record) {
      return null;
    }
    return {
      valid:
        record.used_at === null && record.expires_at.getTime() > now.getTime(),
      phone: record.users.phone,
    };
  }

  async redeem(
    tokenHash: string,
    now: Date,
  ): Promise<RedeemedResetLink | null> {
    return this.prisma.transaction(async (tx) => {
      const claimed = await tx.password_reset_links.updateMany({
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
      const link = await tx.password_reset_links.findUnique({
        where: { token_hash: tokenHash },
        select: { users: { select: { auth_user_id: true } } },
      });
      const authUserId = link?.users.auth_user_id;
      return authUserId ? { authUserId } : null;
    });
  }

  async release(tokenHash: string): Promise<void> {
    await this.prisma.password_reset_links.updateMany({
      where: { token_hash: tokenHash },
      data: { used_at: null },
    });
  }
}
