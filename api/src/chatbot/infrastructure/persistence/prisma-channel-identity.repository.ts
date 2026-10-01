import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ChannelIdentity,
  ChannelIdentityRepository,
  LinkIdentityResult,
  LinkableChannel,
  NewLinkCodeData,
} from '../../domain/ChannelIdentity.js';
import { ChannelIdentityMapper } from './channel-identity.mapper.js';

@Injectable()
export class PrismaChannelIdentityRepository implements ChannelIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceLinkCode(data: NewLinkCodeData): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      // Un código nuevo invalida los anteriores sin usar (mismo criterio que
      // las invitaciones reenviadas, CLI-38).
      await tx.chat_link_codes.deleteMany({
        where: { user_id: data.userId, channel: data.channel, used_at: null },
      });
      await tx.chat_link_codes.create({
        data: {
          user_id: data.userId,
          channel: data.channel,
          code_hash: data.codeHash,
          expires_at: data.expiresAt,
        },
      });
    });
  }

  async hasActiveLinkCode(codeHash: string, now: Date): Promise<boolean> {
    const count = await this.prisma.chat_link_codes.count({
      where: { code_hash: codeHash, used_at: null, expires_at: { gt: now } },
    });
    return count > 0;
  }

  async consumeLinkCode(
    channel: LinkableChannel,
    codeHash: string,
    now: Date,
  ): Promise<string | null> {
    const code = await this.prisma.chat_link_codes.findFirst({
      where: {
        channel,
        code_hash: codeHash,
        used_at: null,
        expires_at: { gt: now },
      },
    });
    if (!code) return null;
    // UPDATE condicional: si dos canjes llegan juntos, solo uno lo marca.
    const { count } = await this.prisma.chat_link_codes.updateMany({
      where: { id: code.id, used_at: null },
      data: { used_at: now },
    });
    return count === 1 ? code.user_id : null;
  }

  countFailedAttemptsSince(
    channel: LinkableChannel,
    externalId: string,
    since: Date,
  ): Promise<number> {
    return this.prisma.chat_link_attempts.count({
      where: {
        channel,
        external_id: externalId,
        succeeded: false,
        created_at: { gte: since },
      },
    });
  }

  async recordAttempt(
    channel: LinkableChannel,
    externalId: string,
    succeeded: boolean,
  ): Promise<void> {
    await this.prisma.chat_link_attempts.create({
      data: { channel, external_id: externalId, succeeded },
    });
  }

  linkIdentity(
    userId: string,
    channel: LinkableChannel,
    externalId: string,
    now: Date,
  ): Promise<LinkIdentityResult> {
    return this.prisma.transaction(async (tx) => {
      const active = await tx.chat_channel_identities.findFirst({
        where: { channel, external_id: externalId, revoked_at: null },
      });
      if (active?.user_id === userId) {
        return {
          identity: ChannelIdentityMapper.toDomain(active),
          previousUserId: null,
        };
      }
      if (active) {
        await tx.chat_channel_identities.update({
          where: { id: active.id },
          data: { revoked_at: now },
        });
      }
      const created = await tx.chat_channel_identities.create({
        data: {
          user_id: userId,
          channel,
          external_id: externalId,
          verified_at: now,
        },
      });
      return {
        identity: ChannelIdentityMapper.toDomain(created),
        previousUserId: active?.user_id ?? null,
      };
    });
  }

  async findActiveByExternalId(
    channel: LinkableChannel,
    externalId: string,
  ): Promise<ChannelIdentity | null> {
    const record = await this.prisma.chat_channel_identities.findFirst({
      where: { channel, external_id: externalId, revoked_at: null },
    });
    return record ? ChannelIdentityMapper.toDomain(record) : null;
  }

  async findActiveForUser(userId: string): Promise<ChannelIdentity[]> {
    const records = await this.prisma.chat_channel_identities.findMany({
      where: { user_id: userId, revoked_at: null },
      orderBy: { verified_at: 'desc' },
    });
    return records.map((record) => ChannelIdentityMapper.toDomain(record));
  }

  async revokeForUser(id: string, userId: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.chat_channel_identities.updateMany({
      where: { id, user_id: userId, revoked_at: null },
      data: { revoked_at: now },
    });
    return count > 0;
  }

  async purgeLinkDataBefore(date: Date): Promise<number> {
    const [codes, attempts] = await Promise.all([
      this.prisma.chat_link_codes.deleteMany({
        where: {
          OR: [{ expires_at: { lt: date } }, { used_at: { lt: date } }],
        },
      }),
      this.prisma.chat_link_attempts.deleteMany({
        where: { created_at: { lt: date } },
      }),
    ]);
    return codes.count + attempts.count;
  }
}
