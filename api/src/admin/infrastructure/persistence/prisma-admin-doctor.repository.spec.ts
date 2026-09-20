import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaAdminDoctorRepository } from './prisma-admin-doctor.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.0.0',
  });
}

const USER_RECORD = {
  id: 'doctor-1',
  auth_user_id: null,
  email: 'juan@example.com',
  display_name: 'Juan Perez',
  photo_url: null,
  phone: '+59170011122',
  is_active: true,
  role: 'odontologist',
  created_at: new Date(),
  updated_at: new Date(),
};

const PROFILE_RECORD = {
  id: 'profile-1',
  user_id: 'doctor-1',
  first_name: 'Juan',
  last_name_paternal: 'Perez',
  last_name_maternal: null,
  specialty: 'Ortodoncia',
  bio: null,
  photo_url: null,
  display_order: 0,
  is_bookable: true,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('PrismaAdminDoctorRepository', () => {
  let prismaMock: {
    doctor_profiles: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    doctor_schedule_blocks: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    users: { create: jest.Mock; update: jest.Mock };
    transaction: jest.Mock;
  };
  let repo: PrismaAdminDoctorRepository;

  beforeEach(() => {
    prismaMock = {
      doctor_profiles: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      doctor_schedule_blocks: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      users: { create: jest.fn(), update: jest.fn() },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };
    repo = new PrismaAdminDoctorRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('findAll', () => {
    it('maps every doctor_profiles row (joined with users) to a summary', async () => {
      prismaMock.doctor_profiles.findMany.mockResolvedValue([
        { ...PROFILE_RECORD, users: USER_RECORD },
      ]);

      const result = await repo.findAll();

      expect(prismaMock.doctor_profiles.findMany).toHaveBeenCalledWith({
        orderBy: { display_order: 'asc' },
        include: { users: true },
      });
      expect(result).toEqual([
        {
          id: 'doctor-1',
          displayName: 'Juan Perez',
          firstName: 'Juan',
          lastNamePaternal: 'Perez',
          lastNameMaternal: null,
          registrationStatus: 'pending',
          email: 'juan@example.com',
          phone: '+59170011122',
          specialty: 'Ortodoncia',
          photoUrl: null,
          displayOrder: 0,
          isBookable: true,
          isActive: true,
        },
      ]);
    });
  });

  describe('registrationStatus', () => {
    it("is 'pending' while users.auth_user_id is null and 'active' once an identity is linked", async () => {
      prismaMock.doctor_profiles.findMany.mockResolvedValue([
        { ...PROFILE_RECORD, users: USER_RECORD },
        {
          ...PROFILE_RECORD,
          users: { ...USER_RECORD, auth_user_id: 'auth-uid-1' },
        },
      ]);

      const result = await repo.findAll();

      expect(result.map((d) => d.registrationStatus)).toEqual([
        'pending',
        'active',
      ]);
    });

    it('keeps listing legacy doctors that have no first/last name yet', async () => {
      prismaMock.doctor_profiles.findMany.mockResolvedValue([
        {
          ...PROFILE_RECORD,
          first_name: null,
          last_name_paternal: null,
          last_name_maternal: null,
          users: USER_RECORD,
        },
      ]);

      const [doctor] = await repo.findAll();

      expect(doctor.firstName).toBeNull();
      expect(doctor.lastNamePaternal).toBeNull();
      expect(doctor.lastNameMaternal).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns null when no doctor_profiles row matches', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(null);

      expect(await repo.findById('missing')).toBeNull();
      expect(prismaMock.doctor_schedule_blocks.findMany).not.toHaveBeenCalled();
    });

    it('returns the detail including scheduleBlocks when found', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue({
        ...PROFILE_RECORD,
        users: USER_RECORD,
      });
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([
        { weekday: 1, start_time: '09:00', end_time: '12:00' },
      ]);

      const result = await repo.findById('doctor-1');

      expect(result?.scheduleBlocks).toEqual([
        { weekday: 1, start: '09:00', end: '12:00' },
      ]);
      expect(result?.bio).toBeNull();
    });
  });

  describe('create', () => {
    const CREATE_DATA = {
      displayName: 'Juan Perez',
      firstName: 'Juan',
      lastNamePaternal: 'Perez',
      lastNameMaternal: null,
      email: 'juan@example.com',
      phone: '+59170011122',
      specialty: 'Ortodoncia',
      bio: null,
      photoUrl: null,
      displayOrder: null,
      scheduleBlocks: [{ weekday: 1, start: '09:00', end: '12:00' }],
    };

    it('creates users (role=odontologist) + doctor_profiles + doctor_schedule_blocks inside one transaction', async () => {
      prismaMock.users.create.mockResolvedValue(USER_RECORD);
      prismaMock.doctor_profiles.create.mockResolvedValue(PROFILE_RECORD);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([
        { weekday: 1, start_time: '09:00', end_time: '12:00' },
      ]);

      const result = await repo.create(CREATE_DATA);

      expect(prismaMock.users.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          display_name: 'Juan Perez',
          email: 'juan@example.com',
          phone: '+59170011122',
          role: 'odontologist',
          auth_user_id: null,
        }) as Record<string, unknown>,
      });
      expect(prismaMock.doctor_profiles.create).toHaveBeenCalledWith({
        data: {
          user_id: 'doctor-1',
          first_name: 'Juan',
          last_name_paternal: 'Perez',
          last_name_maternal: null,
          specialty: 'Ortodoncia',
          bio: null,
          photo_url: null,
          display_order: 0,
          // Nace no reservable hasta que canjea la invitación (CLI-77).
          is_bookable: false,
        },
      });
      expect(prismaMock.doctor_schedule_blocks.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              doctor_id: 'doctor-1',
              weekday: 1,
              start_time: '09:00',
              end_time: '12:00',
            },
          ],
        },
      );
      expect(result.scheduleBlocks).toEqual([
        { weekday: 1, start: '09:00', end: '12:00' },
      ]);
    });

    it('creates a doctor with only a phone (email null) — one contact is enough', async () => {
      prismaMock.users.create.mockResolvedValue({
        ...USER_RECORD,
        email: null,
      });
      prismaMock.doctor_profiles.create.mockResolvedValue(PROFILE_RECORD);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      const result = await repo.create({
        ...CREATE_DATA,
        email: null,
        scheduleBlocks: [],
      });

      expect(prismaMock.users.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          phone: '+59170011122',
        }) as Record<string, unknown>,
      });
      expect(result.email).toBeNull();
    });

    it('skips createMany when scheduleBlocks is empty', async () => {
      prismaMock.users.create.mockResolvedValue(USER_RECORD);
      prismaMock.doctor_profiles.create.mockResolvedValue(PROFILE_RECORD);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      await repo.create({ ...CREATE_DATA, scheduleBlocks: [] });

      expect(
        prismaMock.doctor_schedule_blocks.createMany,
      ).not.toHaveBeenCalled();
    });

    it('translates a P2002 (duplicate email) into ConflictException', async () => {
      prismaMock.users.create.mockRejectedValue(p2002());

      await expect(repo.create(CREATE_DATA)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('returns null when the doctor does not exist', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(null);

      expect(
        await repo.update('missing', { specialty: 'Endodoncia' }),
      ).toBeNull();
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('only patches the fields present in the payload', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(PROFILE_RECORD);
      prismaMock.users.update.mockResolvedValue(USER_RECORD);
      prismaMock.doctor_profiles.update.mockResolvedValue({
        ...PROFILE_RECORD,
        specialty: 'Endodoncia',
      });
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      await repo.update('doctor-1', { specialty: 'Endodoncia' });

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: 'doctor-1' },
        data: { updated_at: expect.any(Date) as Date },
      });
      expect(prismaMock.doctor_profiles.update).toHaveBeenCalledWith({
        where: { user_id: 'doctor-1' },
        data: {
          specialty: 'Endodoncia',
          updated_at: expect.any(Date) as Date,
        },
      });
      expect(
        prismaMock.doctor_schedule_blocks.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it('patches first/last name on doctor_profiles (not on users)', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(PROFILE_RECORD);
      prismaMock.users.update.mockResolvedValue(USER_RECORD);
      prismaMock.doctor_profiles.update.mockResolvedValue(PROFILE_RECORD);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      await repo.update('doctor-1', {
        firstName: 'Marylu',
        lastNamePaternal: 'Aliaga',
        lastNameMaternal: 'Calle',
      });

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: 'doctor-1' },
        data: { updated_at: expect.any(Date) as Date },
      });
      expect(prismaMock.doctor_profiles.update).toHaveBeenCalledWith({
        where: { user_id: 'doctor-1' },
        data: {
          first_name: 'Marylu',
          last_name_paternal: 'Aliaga',
          last_name_maternal: 'Calle',
          updated_at: expect.any(Date) as Date,
        },
      });
    });

    it('replaces the full scheduleBlocks set when it is present in the payload', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(PROFILE_RECORD);
      prismaMock.users.update.mockResolvedValue(USER_RECORD);
      prismaMock.doctor_profiles.update.mockResolvedValue(PROFILE_RECORD);
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([
        { weekday: 2, start_time: '14:00', end_time: '18:00' },
      ]);

      await repo.update('doctor-1', {
        scheduleBlocks: [{ weekday: 2, start: '14:00', end: '18:00' }],
      });

      expect(prismaMock.doctor_schedule_blocks.deleteMany).toHaveBeenCalledWith(
        {
          where: { doctor_id: 'doctor-1' },
        },
      );
      expect(prismaMock.doctor_schedule_blocks.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              doctor_id: 'doctor-1',
              weekday: 2,
              start_time: '14:00',
              end_time: '18:00',
            },
          ],
        },
      );
    });

    it('translates a P2002 (duplicate email) into ConflictException', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(PROFILE_RECORD);
      prismaMock.users.update.mockRejectedValue(p2002());

      await expect(
        repo.update('doctor-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivate', () => {
    it('returns null when the doctor does not exist', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(null);

      expect(await repo.deactivate('missing')).toBeNull();
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('sets users.is_active=false and doctor_profiles.is_bookable=false together', async () => {
      prismaMock.doctor_profiles.findUnique.mockResolvedValue(PROFILE_RECORD);
      prismaMock.users.update.mockResolvedValue({
        ...USER_RECORD,
        is_active: false,
      });
      prismaMock.doctor_profiles.update.mockResolvedValue({
        ...PROFILE_RECORD,
        is_bookable: false,
      });
      prismaMock.doctor_schedule_blocks.findMany.mockResolvedValue([]);

      const result = await repo.deactivate('doctor-1');

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: 'doctor-1' },
        data: { is_active: false, updated_at: expect.any(Date) as Date },
      });
      expect(prismaMock.doctor_profiles.update).toHaveBeenCalledWith({
        where: { user_id: 'doctor-1' },
        data: { is_bookable: false, updated_at: expect.any(Date) as Date },
      });
      expect(result?.isActive).toBe(false);
      expect(result?.isBookable).toBe(false);
    });
  });
});
