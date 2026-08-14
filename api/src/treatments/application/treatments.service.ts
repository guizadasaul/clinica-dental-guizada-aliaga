import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { TreatmentRepository } from '../domain/TreatmentRepository';
import type {
  ITreatmentRepository,
  CreateTreatmentData,
  UpdateTreatmentData,
} from '../domain/TreatmentRepository';
import type { Treatment } from '../domain/Treatment';

@Injectable()
export class TreatmentsService {
  constructor(
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
  ) {}

  findActive(): Promise<Treatment[]> {
    return this.treatmentRepo.findActive();
  }

  async create(data: CreateTreatmentData): Promise<Treatment> {
    try {
      return await this.treatmentRepo.create(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Unique constraint') || msg.includes('unique')) {
        throw new ConflictException('Ya existe un tratamiento con ese nombre');
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateTreatmentData): Promise<Treatment> {
    try {
      const treatment = await this.treatmentRepo.update(id, data);
      if (!treatment) {
        throw new NotFoundException(`Tratamiento con id ${id} no encontrado`);
      }
      return treatment;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Unique constraint') || msg.includes('unique')) {
        throw new ConflictException('Ya existe un tratamiento con ese nombre');
      }
      throw error;
    }
  }
}
