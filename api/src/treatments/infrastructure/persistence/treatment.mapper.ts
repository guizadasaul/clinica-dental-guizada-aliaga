import type { treatments, treatment_categories } from '@prisma/client';
import type { Treatment, TreatmentCategory } from '../../domain/Treatment';

export class TreatmentMapper {
  static toDomain(
    record: treatments & { treatment_categories: treatment_categories },
  ): Treatment {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      description: record.description ?? null,
      basePrice: Number(record.base_price),
      estimatedMinutes: record.estimated_minutes,
      applicationType: record.application_type,
      currency: record.currency,
      categoryId: record.category_id,
      categoryCode: record.treatment_categories.code,
      categoryName: record.treatment_categories.name,
      categoryColor: record.treatment_categories.color,
      displayOrder: record.display_order,
      isActive: record.is_active,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  static toDomainCategory(record: treatment_categories): TreatmentCategory {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      displayOrder: record.display_order,
      color: record.color,
    };
  }
}
