import { Test } from '@nestjs/testing';
import { TestimonialsService } from './testimonials.service';
import { TestimonialRepository } from '../domain/TestimonialRepository';
import type { Testimonial } from '../domain/Testimonial';

const mockRepo = {
  create: jest.fn(),
  findApproved: jest.fn(),
  findPending: jest.fn(),
  updateStatus: jest.fn(),
};

const validRequest = {
  name: 'Laura',
  treatment: 'Limpieza, profilaxis y flúor',
  comment:
    'Excelente atención en toda la clínica, el equipo fue muy profesional ' +
    'y atento durante todo el tratamiento que me realizaron hace poco.',
};

describe('TestimonialsService', () => {
  let service: TestimonialsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TestimonialsService,
        { provide: TestimonialRepository, useValue: mockRepo },
      ],
    }).compile();
    service = module.get(TestimonialsService);
  });

  describe('create', () => {
    it('persiste el testimonio cuando no hay señales de bot', async () => {
      const persisted: Testimonial = {
        id: 'testimonial-1',
        ...validRequest,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.create.mockResolvedValue(persisted);

      const result = await service.create({
        ...validRequest,
        elapsedMs: 5000,
      });

      expect(mockRepo.create).toHaveBeenCalledWith(validRequest);
      expect(result).toBe(persisted);
    });

    it('no persiste y devuelve un testimonio sintético si el honeypot vino lleno', async () => {
      const result = await service.create({
        ...validRequest,
        website: 'https://bot.example',
        elapsedMs: 5000,
      });

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(result.name).toBe(validRequest.name);
      expect(result.treatment).toBe(validRequest.treatment);
      expect(result.comment).toBe(validRequest.comment);
      expect(result.status).toBe('pending');
      expect(result.id).toBeDefined();
    });

    it('no persiste si se mandó en menos de 3000ms', async () => {
      const result = await service.create({
        ...validRequest,
        elapsedMs: 500,
      });

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(result.id).toBeDefined();
    });

    it('persiste si elapsedMs no vino (cliente sin JS / caller directo)', async () => {
      const persisted: Testimonial = {
        id: 'testimonial-2',
        ...validRequest,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.create.mockResolvedValue(persisted);

      const result = await service.create({ ...validRequest });

      expect(mockRepo.create).toHaveBeenCalledWith(validRequest);
      expect(result).toBe(persisted);
    });

    it('ignora un honeypot con solo espacios (no cuenta como "lleno")', async () => {
      const persisted: Testimonial = {
        id: 'testimonial-3',
        ...validRequest,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.create.mockResolvedValue(persisted);

      const result = await service.create({
        ...validRequest,
        website: '   ',
        elapsedMs: 5000,
      });

      expect(mockRepo.create).toHaveBeenCalledWith(validRequest);
      expect(result).toBe(persisted);
    });
  });
});
