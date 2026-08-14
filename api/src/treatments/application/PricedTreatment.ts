import type { Treatment } from '../domain/Treatment';

/**
 * `Treatment` no sabe de tipo de cambio — es responsabilidad de la capa de
 * aplicación, no del dominio (CLI-19). `null` si currency es BOB (no
 * duplicar el mismo número) o si no hay tipo de cambio disponible.
 */
export type PricedTreatment = Treatment & { basePriceBob: number | null };
