import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  ITestimonialRepository,
  CreateTestimonialData,
} from '../../domain/TestimonialRepository.js';
import type {
  Testimonial,
  TestimonialStatus,
} from '../../domain/Testimonial.js';
import { TestimonialMapper } from './testimonial.mapper.js';

@Injectable()
export class PrismaTestimonialsRepository implements ITestimonialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTestimonialData): Promise<Testimonial> {
    const record = await this.prisma.testimonials.create({
      data: {
        name: data.name,
        treatment: data.treatment,
        comment: data.comment,
      },
    });
    return TestimonialMapper.toDomain(record);
  }

  async findApproved(): Promise<Testimonial[]> {
    const records = await this.prisma.testimonials.findMany({
      where: { status: 'approved' },
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => TestimonialMapper.toDomain(r));
  }

  async findPending(): Promise<Testimonial[]> {
    const records = await this.prisma.testimonials.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });
    return records.map((r) => TestimonialMapper.toDomain(r));
  }

  async updateStatus(
    id: string,
    status: TestimonialStatus,
  ): Promise<Testimonial | null> {
    try {
      const record = await this.prisma.testimonials.update({
        where: { id },
        data: { status },
      });
      return TestimonialMapper.toDomain(record);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }
}
