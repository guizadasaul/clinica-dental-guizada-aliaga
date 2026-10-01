import type { chat_channel_identities } from '@prisma/client';
import type {
  ChannelIdentity,
  LinkableChannel,
} from '../../domain/ChannelIdentity';

/** El CHECK de la migración (CLI-100) garantiza el valor de channel. */
export class ChannelIdentityMapper {
  static toDomain(record: chat_channel_identities): ChannelIdentity {
    return {
      id: record.id,
      userId: record.user_id,
      channel: record.channel as LinkableChannel,
      externalId: record.external_id,
      verifiedAt: record.verified_at,
      revokedAt: record.revoked_at,
    };
  }
}
