import type { treatments } from '@prisma/client';
import type { Treatment } from '../../domain/Treatment';

export class TreatmentMapper {
  static toDomain(record: treatments): Treatment {
    return {
      id: record.id,
      name: record.name,
      description: record.description ?? null,
      basePrice: Number(record.base_price),
      estimatedMinutes: record.estimated_minutes,
      isActive: record.is_active,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
