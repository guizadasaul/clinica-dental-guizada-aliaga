import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TestimonialRepository } from '../domain/TestimonialRepository';
import type {
  ITestimonialRepository,
  CreateTestimonialData,
} from '../domain/TestimonialRepository';
import type { Testimonial, TestimonialStatus } from '../domain/Testimonial';

/**
 * Ms mínimos entre que se abre el formulario y se manda — un bot típico
 * completa y envía en milisegundos, un humano tarda bastante más en escribir
 * 20+ palabras. Ver `looksLikeBot()`.
 */
const MIN_ELAPSED_MS = 3000;

/** `CreateTestimonialData` + las dos señales anti-bot (nunca se persisten). */
export interface CreateTestimonialRequest extends CreateTestimonialData {
  website?: string;
  elapsedMs?: number;
}

@Injectable()
export class TestimonialsService {
  constructor(
    @Inject(TestimonialRepository)
    private readonly testimonialRepo: ITestimonialRepository,
  ) {}

  /**
   * Anti-bot (CLI-36): el endpoint es público, sin sesión, a propósito, así
   * que es el blanco obvio de spam automatizado. Si el honeypot vino lleno
   * (un humano nunca lo completa, un bot que rellena todos los inputs sí) o
   * si se mandó demasiado rápido, se devuelve 201 con un `Testimonial`
   * sintético — misma forma de respuesta que un alta real — pero sin tocar
   * la base. Cero señal distinguible para el bot de que fue rechazado.
   */
  create(request: CreateTestimonialRequest): Promise<Testimonial> {
    if (this.looksLikeBot(request)) {
      return Promise.resolve(this.buildSyntheticTestimonial(request));
    }
    const { name, treatment, comment } = request;
    return this.testimonialRepo.create({ name, treatment, comment });
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

  private looksLikeBot(request: CreateTestimonialRequest): boolean {
    const honeypotFilled =
      typeof request.website === 'string' && request.website.trim() !== '';
    const tooFast =
      typeof request.elapsedMs === 'number' &&
      request.elapsedMs < MIN_ELAPSED_MS;
    return honeypotFilled || tooFast;
  }

  private buildSyntheticTestimonial(
    request: CreateTestimonialRequest,
  ): Testimonial {
    const now = new Date();
    return {
      id: randomUUID(),
      name: request.name,
      treatment: request.treatment,
      comment: request.comment,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
  }
}
