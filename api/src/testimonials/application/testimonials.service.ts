import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TestimonialRepository } from '../domain/TestimonialRepository';
import type {
  ITestimonialRepository,
  CreateTestimonialData,
} from '../domain/TestimonialRepository';
import type { Testimonial, TestimonialStatus } from '../domain/Testimonial';

@Injectable()
export class TestimonialsService {
  constructor(
    @Inject(TestimonialRepository)
    private readonly testimonialRepo: ITestimonialRepository,
  ) {}

  create(data: CreateTestimonialData): Promise<Testimonial> {
    return this.testimonialRepo.create(data);
  }

  findApproved(): Promise<Testimonial[]> {
    return this.testimonialRepo.findApproved();
  }

  findPending(): Promise<Testimonial[]> {
    return this.testimonialRepo.findPending();
  }

  async updateStatus(
    id: string,
    status: TestimonialStatus,
  ): Promise<Testimonial> {
    const testimonial = await this.testimonialRepo.updateStatus(id, status);
    if (!testimonial) {
      throw new NotFoundException(`Testimonio con id ${id} no encontrado`);
    }
    return testimonial;
  }
}
