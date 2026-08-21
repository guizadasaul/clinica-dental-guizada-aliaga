import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TestimonialsService } from '../../application/testimonials.service.js';
import { Testimonial } from '../../domain/Testimonial.js';
import { readEnvInt } from '../../../shared/env.util.js';
import { CreateTestimonialDto } from './dto/create-testimonial.dto.js';

const HOUR_MS = 3_600_000;

// Sin SupabaseAuthGuard a propósito: cualquier visitante de la landing,
// con o sin cuenta, puede dejar un comentario. Queda en status "pending"
// (default de Prisma) hasta aprobarse a mano — todavía no hay pantalla
// de moderación, así que findApproved() es la única lectura pública.
@Controller('public/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // 3/hora por IP (CLI-36) — configurable por env porque con 3/hora es
  // imposible probar el formulario a mano en dev. `limit` es una función:
  // @nestjs/throttler la evalúa por request (Resolvable<number>), así que
  // lee `process.env` recién ahí, ya con .env cargado por ConfigModule.
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_TESTIMONIALS_PER_HOUR', 3),
      ttl: HOUR_MS,
    },
  })
  create(@Body() dto: CreateTestimonialDto): Promise<Testimonial> {
    // La decisión anti-bot (honeypot / envío demasiado rápido) vive en
    // TestimonialsService.create(), no acá — el controller solo pasa los
    // campos, sin lógica de negocio.
    return this.testimonialsService.create({
      name: dto.name,
      treatment: dto.treatment,
      comment: dto.comment,
      website: dto.website,
      elapsedMs: dto.elapsedMs,
    });
  }

  @Get()
  findApproved(): Promise<Testimonial[]> {
    return this.testimonialsService.findApproved();
  }
}
