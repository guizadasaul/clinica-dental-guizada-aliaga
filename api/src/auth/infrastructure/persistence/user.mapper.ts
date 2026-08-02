import type { users } from '@prisma/client';
import { User } from '../../domain/User.js';
import { UserRole } from '../../domain/value-objects/UserRole.js';

export class UserMapper {
  static toDomain(record: users): User {
    return new User(
      record.id,
      record.firebase_uid,
      record.email,
      record.role as UserRole,
      record.display_name,
      record.phone,
      record.photo_url,
      record.password_hash,
      record.is_active,
      record.created_at,
      record.updated_at,
    );
  }
}
