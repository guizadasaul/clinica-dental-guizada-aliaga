import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { TestimonialsService } from '../../application/testimonials.service.js';
import { Testimonial } from '../../domain/Testimonial.js';
import { CreateTestimonialDto } from './dto/create-testimonial.dto.js';

// Sin SupabaseAuthGuard a propósito: cualquier visitante de la landing,
// con o sin cuenta, puede dejar un comentario. Queda en status "pending"
// (default de Prisma) hasta aprobarse a mano — todavía no hay pantalla
// de moderación, así que findApproved() es la única lectura pública.
@Controller('public/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTestimonialDto): Promise<Testimonial> {
    return this.testimonialsService.create({
      name: dto.name,
      treatment: dto.treatment,
      comment: dto.comment,
    });
  }

  @Get()
  findApproved(): Promise<Testimonial[]> {
    return this.testimonialsService.findApproved();
  }
}
