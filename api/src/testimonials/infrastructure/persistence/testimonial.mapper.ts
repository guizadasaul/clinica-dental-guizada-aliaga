import type { testimonials } from '@prisma/client';
import type { Testimonial } from '../../domain/Testimonial';

export class TestimonialMapper {
  static toDomain(record: testimonials): Testimonial {
    return {
      id: record.id,
      name: record.name,
      treatment: record.treatment,
      comment: record.comment,
      status: record.status,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
