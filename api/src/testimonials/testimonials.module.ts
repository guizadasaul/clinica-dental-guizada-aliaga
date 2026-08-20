import { Module } from '@nestjs/common';
import { TestimonialsController } from './infrastructure/http/testimonials.controller';
import { DoctorTestimonialsController } from './infrastructure/http/doctor-testimonials.controller';
import { TestimonialsService } from './application/testimonials.service';
import { TestimonialRepository } from './domain/TestimonialRepository';
import { PrismaTestimonialsRepository } from './infrastructure/persistence/prisma-testimonials.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TestimonialsController, DoctorTestimonialsController],
  providers: [
    TestimonialsService,
    { provide: TestimonialRepository, useClass: PrismaTestimonialsRepository },
  ],
})
export class TestimonialsModule {}
