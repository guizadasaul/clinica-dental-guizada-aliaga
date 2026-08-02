export interface Treatment {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
