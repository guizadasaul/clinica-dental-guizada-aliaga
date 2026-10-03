import { Module } from '@nestjs/common';
import { TestimonialsController } from './infrastructure/http/testimonials.controller';
import { AdminTestimonialsController } from './infrastructure/http/admin-testimonials.controller';
import { TestimonialsService } from './application/testimonials.service';
import { TestimonialRepository } from './domain/TestimonialRepository';
import { PrismaTestimonialsRepository } from './infrastructure/persistence/prisma-testimonials.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TestimonialsController, AdminTestimonialsController],
  providers: [
    TestimonialsService,
    { provide: TestimonialRepository, useClass: PrismaTestimonialsRepository },
  ],
})
export class TestimonialsModule {}
