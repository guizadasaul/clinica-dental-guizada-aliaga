import type {
  doctor_profiles,
  doctor_schedule_blocks,
  users,
} from '@prisma/client';
import type {
  AdminDoctorDetail,
  AdminDoctorSummary,
  DoctorScheduleBlock,
} from '../../domain/AdminDoctor';

export class AdminDoctorMapper {
  static toSummary(
    record: doctor_profiles & { users: users },
  ): AdminDoctorSummary {
    return {
      id: record.user_id,
      displayName: record.users.display_name,
      firstName: record.first_name,
      lastNamePaternal: record.last_name_paternal,
      lastNameMaternal: record.last_name_maternal,
      registrationStatus:
        record.users.auth_user_id === null ? 'pending' : 'active',
      email: record.users.email,
      phone: record.users.phone,
      specialty: record.specialty,
      photoUrl: record.photo_url,
      displayOrder: record.display_order,
      isBookable: record.is_bookable,
      isActive: record.users.is_active,
    };
  }

  static toDetail(
    record: doctor_profiles & { users: users },
    scheduleBlocks: doctor_schedule_blocks[],
  ): AdminDoctorDetail {
    return {
      ...AdminDoctorMapper.toSummary(record),
      bio: record.bio,
      scheduleBlocks: scheduleBlocks.map((b) =>
        AdminDoctorMapper.blockToDomain(b),
      ),
    };
  }

  static blockToDomain(record: doctor_schedule_blocks): DoctorScheduleBlock {
    return {
      weekday: record.weekday,
      start: record.start_time,
      end: record.end_time,
    };
  }
}
