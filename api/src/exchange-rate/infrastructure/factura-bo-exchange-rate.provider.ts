import { Injectable, Logger } from '@nestjs/common';
import type {
  ExchangeRateProvider as IExchangeRateProvider,
  UsdToBobRate,
} from '../domain/ExchangeRateProvider.js';

export class ExchangeRateApiError extends Error {}

interface FacturaBoResponse {
  ok: boolean;
  datos?: {
    usd_bob: number;
    fuente: string;
  };
  error?: string | null;
}

const FACTURA_BO_URL = 'https://api.factura.bo/ExchangeRate';

/** El BCB publica la cotización oficial ~1 vez al día — no hace falta más frecuencia. */
const RATE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Sin API key ni autenticación (endpoint público y gratuito), así que a
 * diferencia de BanecoClient no hay REQUIRED_ENV_VARS que validar — la
 * URL es una constante, con un override opcional leído de forma perezosa
 * (nunca en el constructor, mismo motivo que BanecoClient: la app debe
 * arrancar igual aunque este proveedor esté mal configurado).
 *
 * Cache en memoria (campos de instancia de este provider singleton, sin
 * librería externa — mismo patrón que el token de BanecoClient). Extiende
 * ese patrón con algo sin precedente en el repo: `cached` no se limpia
 * nunca, así sirve tanto de cache "fresco" (dentro del TTL) como de
 * último valor conocido para el fallback si el fetch nuevo falla.
 */
@Injectable()
export class FacturaBoExchangeRateProvider implements IExchangeRateProvider {
  private readonly logger = new Logger(FacturaBoExchangeRateProvider.name);

  private cached: UsdToBobRate | null = null;
  private cachedAtMs = 0;

  async getUsdToBob(): Promise<UsdToBobRate | null> {
    if (this.cached && Date.now() - this.cachedAtMs < RATE_TTL_MS) {
      return this.cached;
    }

    try {
      const fresh = await this.fetchRate();
      this.cached = fresh;
      this.cachedAtMs = Date.now();
      return fresh;
    } catch (error) {
      this.logger.warn(
        `No se pudo obtener el tipo de cambio de factura.bo, sirviendo el último valor conocido: ${(error as Error).message}`,
      );
      return this.cached ? { ...this.cached, stale: true } : null;
    }
  }

  private async fetchRate(): Promise<UsdToBobRate> {
    const url = process.env['FACTURA_BO_URL'] ?? FACTURA_BO_URL;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new ExchangeRateApiError(
        `No se pudo conectar con factura.bo: ${(error as Error).message}`,
      );
    }

    let parsed: FacturaBoResponse;
    try {
      parsed = (await response.json()) as FacturaBoResponse;
    } catch {
      throw new ExchangeRateApiError(
        `Respuesta inválida de factura.bo (HTTP ${response.status})`,
      );
    }

    const rate = parsed.datos?.usd_bob;
    if (
      !response.ok ||
      !parsed.ok ||
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      throw new ExchangeRateApiError(
        parsed.error ||
          `factura.bo devolvió un tipo de cambio inválido (HTTP ${response.status})`,
      );
    }

    return {
      rate,
      fetchedAt: new Date(),
      source: parsed.datos?.fuente ?? 'factura.bo',
      stale: false,
    };
  }
}
