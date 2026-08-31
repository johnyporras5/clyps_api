import { getPlan, type PlanId } from './config/plans.config';
import { usdMinorToVesMinor } from './subscription-money.util';

/**
 * Reglas de la cotización en Bs (SUB-2 / CLYP-334).
 *
 * La cotización NO se persiste: se calcula, viaja al cliente y se congela
 * dentro del PaymentReport al reportar el pago (SUB-3). Estas funciones son la
 * única aritmética que decide cuántos Bs se cobran, y la única que valida que
 * lo que vuelve del cliente sea lo que se le entregó.
 */

/** Fin de la ventana de validez de una cotización. */
export function quoteValidUntil(quotedAt: Date, ttlHours: number): Date {
  return new Date(quotedAt.getTime() + ttlHours * 60 * 60 * 1000);
}

/** Monto a pagar en céntimos de Bs por un plan a una tasa dada. */
export function quoteAmountVesMinor(planId: PlanId, rate: number): number {
  return usdMinorToVesMinor(getPlan(planId).priceUsdMinor, rate);
}

/** Lo que el cliente devuelve al reportar: la cotización que se le entregó. */
export interface FrozenQuote {
  planId: PlanId;
  amountVesMinor: number;
  frozenRate: number;
  quotedAt: Date;
}

export type FrozenQuoteRejection =
  | 'expired'
  | 'amount_mismatch'
  | 'rate_out_of_band';

export type FrozenQuoteCheck =
  | { ok: true }
  | { ok: false; reason: FrozenQuoteRejection; message: string };

export interface FrozenQuoteRules {
  /** Cuánto vale una cotización antes de tener que recotizar. */
  ttlHours: number;
  /** Cuánto puede haberse movido la tasa congelada contra la de hoy, en bps. */
  toleranceBps: number;
}

/**
 * Valida la cotización congelada que llega desde el cliente contra la tasa del
 * momento. El backend NO confía en lo que le mandan: una cotización vieja o con
 * los números editados a mano se rechaza y el dueño tiene que recotizar.
 *
 * Los tres motivos son distintos a propósito: el front necesita saber si basta
 * con recotizar (`expired`, `rate_out_of_band`) o si el payload venía roto
 * (`amount_mismatch`).
 */
export function validateFrozenQuote(
  frozen: FrozenQuote,
  currentRate: number,
  rules: FrozenQuoteRules,
  now: Date = new Date(),
): FrozenQuoteCheck {
  const quotedAtMs = frozen.quotedAt.getTime();
  const ageMs = now.getTime() - quotedAtMs;
  const ttlMs = rules.ttlHours * 60 * 60 * 1000;

  // Una cotización del futuro es tan sospechosa como una vencida.
  if (!Number.isFinite(quotedAtMs) || ageMs > ttlMs || ageMs < -60_000) {
    return {
      ok: false,
      reason: 'expired',
      message: 'La cotización venció. Vuelve a cotizar el monto en Bs.',
    };
  }

  if (!Number.isFinite(frozen.frozenRate) || frozen.frozenRate <= 0) {
    return {
      ok: false,
      reason: 'rate_out_of_band',
      message: 'La tasa de la cotización no es válida. Vuelve a cotizar.',
    };
  }

  // El monto tiene que ser exactamente el que sale del plan y esa tasa: si no,
  // lo editaron en el camino.
  if (
    frozen.amountVesMinor !==
    quoteAmountVesMinor(frozen.planId, frozen.frozenRate)
  ) {
    return {
      ok: false,
      reason: 'amount_mismatch',
      message: 'El monto no corresponde al plan y la tasa cotizados.',
    };
  }

  const drift =
    Math.abs(frozen.frozenRate - currentRate) / Math.max(currentRate, 1e-9);
  if (drift > rules.toleranceBps / 10000) {
    return {
      ok: false,
      reason: 'rate_out_of_band',
      message:
        'La tasa cambió demasiado desde que cotizaste. Vuelve a cotizar.',
    };
  }

  return { ok: true };
}
