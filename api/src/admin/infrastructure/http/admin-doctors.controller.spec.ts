import { AdminDoctorsController } from './admin-doctors.controller';
import { AdminDoctorsService } from '../../application/admin-doctors.service';
import type { CreateDoctorDto } from './dto/create-doctor.dto';

describe('AdminDoctorsController', () => {
  let controller: AdminDoctorsController;
  const mockService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    createDoctor: jest.fn(),
    updateDoctor: jest.fn(),
    inviteDoctor: jest.fn(),
    deactivateDoctor: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminDoctorsController(
      mockService as unknown as AdminDoctorsService,
    );
  });

  // CLI-76: nombre y apellidos viajan del DTO al service tal cual.
  describe('create', () => {
    const DTO = {
      displayName: 'Dra. Marylu Aliaga',
      firstName: 'Marylu',
      lastNamePaternal: 'Aliaga',
      email: 'marylu@example.com',
      scheduleBlocks: [{ weekday: 1, start: '09:00', end: '12:00' }],
    } as CreateDoctorDto;

    it('passes first name and paternal last name to the service and defaults the optional fields to null', async () => {
      mockService.createDoctor.mockResolvedValue({ doctor: {} });

      await controller.create(DTO);

      expect(mockService.createDoctor).toHaveBeenCalledWith({
        displayName: 'Dra. Marylu Aliaga',
        firstName: 'Marylu',
        lastNamePaternal: 'Aliaga',
        lastNameMaternal: null,
        email: 'marylu@example.com',
        phone: null,
        specialty: null,
        bio: null,
        photoUrl: null,
        displayOrder: null,
        scheduleBlocks: [{ weekday: 1, start: '09:00', end: '12:00' }],
      });
    });

    it('passes a doctor with only a phone (no email) as email=null', async () => {
      mockService.createDoctor.mockResolvedValue({ doctor: {} });

      await controller.create({
        ...DTO,
        email: undefined,
        phone: '+59170011122',
      });

      expect(mockService.createDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ email: null, phone: '+59170011122' }),
      );
    });

    it('passes the maternal last name when present', async () => {
      mockService.createDoctor.mockResolvedValue({ doctor: {} });

      await controller.create({ ...DTO, lastNameMaternal: 'Calle' });

      expect(mockService.createDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ lastNameMaternal: 'Calle' }),
      );
    });
  });

  describe('createInvite (CLI-77)', () => {
    it('delegates to inviteDoctor with the doctor id and the chosen channel', async () => {
      mockService.inviteDoctor.mockResolvedValue({
        whatsappUrl: 'https://wa.me/1',
      });

      const result = await controller.createInvite('doctor-1', {
        channel: 'whatsapp',
      });

      expect(mockService.inviteDoctor).toHaveBeenCalledWith(
        'doctor-1',
        'whatsapp',
      );
      expect(result).toEqual({ whatsappUrl: 'https://wa.me/1' });
    });
  });

  describe('update', () => {
    it('only forwards the fields present in the body (partial PATCH)', async () => {
      mockService.updateDoctor.mockResolvedValue({});

      await controller.update('doctor-1', {
        firstName: 'Marylu',
        lastNamePaternal: 'Aliaga',
        lastNameMaternal: 'Calle',
      });

      expect(mockService.updateDoctor).toHaveBeenCalledWith('doctor-1', {
        firstName: 'Marylu',
        lastNamePaternal: 'Aliaga',
        lastNameMaternal: 'Calle',
      });
    });

    it('does not send name fields when the body does not include them, so legacy doctors keep working', async () => {
      mockService.updateDoctor.mockResolvedValue({});

      await controller.update('doctor-1', {
        specialty: 'Ortodoncia',
      });

      expect(mockService.updateDoctor).toHaveBeenCalledWith('doctor-1', {
        specialty: 'Ortodoncia',
      });
    });
  });
});
