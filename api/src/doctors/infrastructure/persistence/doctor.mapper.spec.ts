import type { doctor_profiles, users } from '@prisma/client';
import { DoctorMapper } from './doctor.mapper';

function fakeRecord(
  overrides: Partial<doctor_profiles> = {},
  userOverrides: Partial<users> = {},
): doctor_profiles & { users: users } {
  return {
    id: 'profile-1',
    user_id: 'doctor-1',
    first_name: null,
    last_name_paternal: null,
    last_name_maternal: null,
    specialty: 'Ortodoncia',
    bio: 'Bio',
    photo_url: 'https://example.com/photo.jpg',
    display_order: 0,
    is_bookable: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
    users: {
      id: 'doctor-1',
      auth_user_id: null,
      email: 'doctor@example.com',
      display_name: 'Dra. Ejemplo',
      photo_url: 'https://google.example/avatar.jpg',
      phone: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
      role: 'odontologist',
      ...userOverrides,
    },
  };
}

describe('DoctorMapper', () => {
  it('maps id from users.id (doctor_profiles.user_id), not doctor_profiles.id', () => {
    const doctor = DoctorMapper.toDomain(fakeRecord());
    expect(doctor.id).toBe('doctor-1');
  });

  it('uses users.display_name for the name and doctor_profiles.photo_url for the photo, not the Google avatar', () => {
    const doctor = DoctorMapper.toDomain(fakeRecord());
    expect(doctor.displayName).toBe('Dra. Ejemplo');
    expect(doctor.photoUrl).toBe('https://example.com/photo.jpg');
  });

  it('passes through specialty, bio, displayOrder and isBookable', () => {
    const doctor = DoctorMapper.toDomain(
      fakeRecord({
        specialty: 'Endodoncia',
        bio: 'Otra bio',
        display_order: 2,
        is_bookable: false,
      }),
    );
    expect(doctor.specialty).toBe('Endodoncia');
    expect(doctor.bio).toBe('Otra bio');
    expect(doctor.displayOrder).toBe(2);
    expect(doctor.isBookable).toBe(false);
  });
});
