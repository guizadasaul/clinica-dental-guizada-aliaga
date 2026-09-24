import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TestimonialsController } from './testimonials.controller';
import { DoctorTestimonialsController } from './doctor-testimonials.controller';
import { TestimonialsService } from '../../application/testimonials.service';
import { UpdateTestimonialStatusDto } from './dto/update-testimonial-status.dto';

describe('controllers de comentarios', () => {
  const service = {
    create: jest.fn(),
    findApproved: jest.fn(),
    findPending: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('TestimonialsController (público)', () => {
    const controller = new TestimonialsController(
      service as unknown as TestimonialsService,
    );
    const savedEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...savedEnv };
    });

    it('create pasa el comentario y las señales anti-bot al service', async () => {
      const dto = {
        name: 'Ana',
        treatment: 'Limpieza',
        comment: 'Excelente',
        website: '',
        elapsedMs: 12_000,
      };

      await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
    });

    it('findApproved lista los aprobados', async () => {
      service.findApproved.mockResolvedValue([]);

      await expect(controller.findApproved()).resolves.toEqual([]);
    });

    // CLI-36: 3 por hora por IP, configurable para poder probarlo en dev.
    it('limita a 3 por hora por default, configurable con THROTTLE_TESTIMONIALS_PER_HOUR', () => {
      const limit = Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        Reflect.get(TestimonialsController.prototype, 'create'),
      ) as () => number;

      delete process.env['THROTTLE_TESTIMONIALS_PER_HOUR'];
      expect(limit()).toBe(3);
      process.env['THROTTLE_TESTIMONIALS_PER_HOUR'] = '100';
      expect(limit()).toBe(100);
    });
  });

  describe('DoctorTestimonialsController (moderación)', () => {
    const controller = new DoctorTestimonialsController(
      service as unknown as TestimonialsService,
    );

    it('findPending lista la cola de moderación', async () => {
      service.findPending.mockResolvedValue([]);

      await expect(controller.findPending()).resolves.toEqual([]);
    });

    it('updateStatus aprueba o rechaza', async () => {
      await controller.updateStatus('testimonial-1', { status: 'approved' });

      expect(service.updateStatus).toHaveBeenCalledWith(
        'testimonial-1',
        'approved',
      );
    });
  });

  describe('UpdateTestimonialStatusDto', () => {
    it.each(['approved', 'rejected'])('acepta %s', async (status) => {
      await expect(
        validate(plainToInstance(UpdateTestimonialStatusDto, { status })),
      ).resolves.toEqual([]);
    });

    it.each(['pending', 'borrado', undefined])(
      'rechaza %p (solo se modera a aprobado o rechazado)',
      async (status) => {
        const errors = await validate(
          plainToInstance(UpdateTestimonialStatusDto, { status }),
        );
        expect(errors.map((e) => e.property)).toEqual(['status']);
      },
    );
  });
});
