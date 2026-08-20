import type { Testimonial, TestimonialStatus } from './Testimonial';

export interface CreateTestimonialData {
  name: string;
  treatment: string;
  comment: string;
}

export interface ITestimonialRepository {
  create(data: CreateTestimonialData): Promise<Testimonial>;
  findApproved(): Promise<Testimonial[]>;
  findPending(): Promise<Testimonial[]>;
  /** null si no existe un testimonio con ese id. */
  updateStatus(
    id: string,
    status: TestimonialStatus,
  ): Promise<Testimonial | null>;
}

export const TestimonialRepository = Symbol('ITestimonialRepository');
