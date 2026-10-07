import { ServiceUnavailableException } from '@nestjs/common';
import {
  convertUsdToBob,
  type ExchangeRateProvider,
} from '../../exchange-rate/domain/ExchangeRateProvider';
import type { TreatmentApplicationType } from '../../treatments/domain/TreatmentApplicationType';
import type {
  NewQuoteItemData,
  NewQuoteItemGroupData,
} from '../domain/QuoteRepository';

export function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Un precio en Bs y el tipo de cambio con que se convirtió (null si ya estaba en Bs). */
export interface PriceInBob {
  amount: number;
  exchangeRate: number | null;
}

/**
 * Lleva a Bs un precio en la moneda del tratamiento. Los presupuestos
 * siempre suman en Bs: un tratamiento en USD se convierte con el tipo de
 * cambio del día, o 503 si no se pudo obtener.
 */
export async function priceInBob(
  amount: number,
  currency: string,
  exchangeRates: ExchangeRateProvider,
): Promise<PriceInBob> {
  if (currency !== 'USD') {
    return { amount, exchangeRate: null };
  }
  const rate = await exchangeRates.getUsdToBob();
  if (!rate) {
    throw new ServiceUnavailableException(
      'No se pudo obtener el tipo de cambio para calcular el precio en bolivianos. Intenta de nuevo en unos minutos.',
    );
  }
  return {
    amount: convertUsdToBob(amount, rate.rate),
    exchangeRate: rate.rate,
  };
}

/** Las filas de una línea nueva del presupuesto (CLI-226: también la usa el registro de tratamientos). */
export type NewQuoteLine =
  | { kind: 'rows'; rows: NewQuoteItemData[] }
  | { kind: 'group'; group: NewQuoteItemGroupData };

/**
 * Arma una línea del presupuesto según el tipo de aplicación:
 * - multiple_teeth: un grupo con un solo precio y una fila por pieza (CLI-45);
 * - single_tooth: una fila con su pieza;
 * - el resto: una fila sin pieza, con cantidad (unidad/caja) o 1.
 */
export function buildQuoteLine(
  applicationType: TreatmentApplicationType,
  toothNumbers: number[],
  treatmentId: string,
  unitPrice: number,
  quantity: number,
  currency: string,
  exchangeRate: number | null,
): NewQuoteLine {
  if (applicationType === 'multiple_teeth') {
    return {
      kind: 'group',
      group: {
        treatmentId,
        toothNumbers: toothNumbers.toSorted((a, b) => a - b),
        unitPrice,
        subtotal: round2(unitPrice),
        currency,
        exchangeRate,
      },
    };
  }

  const shared = { treatmentId, currency, exchangeRate };
  if (applicationType === 'single_tooth') {
    return {
      kind: 'rows',
      rows: [
        {
          ...shared,
          toothNumber: toothNumbers[0],
          unitPrice,
          quantity: 1,
          subtotal: round2(unitPrice),
        },
      ],
    };
  }
  return {
    kind: 'rows',
    rows: [
      {
        ...shared,
        toothNumber: null,
        unitPrice,
        quantity,
        subtotal: round2(unitPrice * quantity),
      },
    ],
  };
}
