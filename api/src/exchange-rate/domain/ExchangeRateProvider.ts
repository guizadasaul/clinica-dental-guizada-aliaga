export interface UsdToBobRate {
  /** Bolivianos por 1 dólar. */
  rate: number;
  fetchedAt: Date;
  source: string;
  /** true si es el último valor cacheado servido tras un fallo de la API externa, no el valor fresco. */
  stale: boolean;
}

/**
 * Abstrae la fuente del tipo de cambio USD→BOB fuera del dominio — mismo
 * patrón que PaymentGateway/AccessTokenVerifier. La implementación real
 * (FacturaBoExchangeRateProvider) vive en infrastructure/.
 *
 * Nunca lanza: si no hay tipo de cambio disponible (ni fresco ni
 * cacheado), devuelve null. Un tratamiento en USD sin conversión visible
 * es un problema cosmético, no debería romper el listado de tratamientos
 * — el caller decide si eso es aceptable (lectura) o no (persistir un
 * monto en un presupuesto).
 */
export interface ExchangeRateProvider {
  getUsdToBob(): Promise<UsdToBobRate | null>;
}

export const ExchangeRateProvider = Symbol('ExchangeRateProvider');

/** Redondeo a 2 decimales, consistente con las columnas Decimal(10,2) de la DB. */
export function convertUsdToBob(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}
