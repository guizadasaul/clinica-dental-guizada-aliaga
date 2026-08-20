import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { TestimonialsService } from '../../application/testimonials.service.js';
import { Testimonial } from '../../domain/Testimonial.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { UpdateTestimonialStatusDto } from './dto/update-testimonial-status.dto.js';

// Moderación de comentarios — distinto del TestimonialsController público
// (mismo recurso, rutas separadas: acá solo entra el odontólogo logueado).
@Controller('testimonials')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST)
export class DoctorTestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Get('pending')
  findPending(): Promise<Testimonial[]> {
    return this.testimonialsService.findPending();
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestimonialStatusDto,
  ): Promise<Testimonial> {
    return this.testimonialsService.updateStatus(id, dto.status);
  }
}
