import type { doctor_profiles, users } from '@prisma/client';
import type { Doctor } from '../../domain/Doctor';

export class DoctorMapper {
  static toDomain(record: doctor_profiles & { users: users }): Doctor {
    return {
      id: record.user_id,
      displayName: record.users.display_name,
      specialty: record.specialty,
      bio: record.bio,
      photoUrl: record.photo_url,
      displayOrder: record.display_order,
      isBookable: record.is_bookable,
    };
  }
}
