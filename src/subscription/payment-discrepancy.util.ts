import { getPlan, type PlanId } from './config/plans.config';
import { usdMinorToVesMinor } from './subscription-money.util';
import type { PaymentMethod } from './subscription.enums';

/**
 * Discrepancia de monto en la cola de verificación (SUB-4 / CLYP-336).
 *
 * El admin necesita ver de un vistazo si lo reportado es lo que se esperaba.
 * Una discrepancia NO rechaza nada de forma automática: solo se resalta, y la
 * decisión sigue siendo del humano (puede verificar igual — un pago de menos
 * puede estar acordado, o el dueño pudo pagar de más).
 */

/** Tolerancia por defecto: 1%. Cubre el redondeo del banco, no un monto mal. */
export const DEFAULT_AMOUNT_TOLERANCE_BPS = 100;

/** Lo que hace falta del reporte para juzgar el monto. */
export interface DiscrepancyInput {
  planId: PlanId;
  method: PaymentMethod;
  amountVesMinor: number | null;
  amountUsdMinor: number | null;
  /** Tasa congelada al cotizar. Solo Pago Móvil. */
  frozenRate: number | null;
}

export interface AmountDiscrepancy {
  /** Moneda en la que se compara: VES en Pago Móvil, USD en los demás. */
  currency: string;
  /** Lo que debió pagarse, en unidades mínimas. */
  expectedMinor: number;
  /** Lo que el dueño dice haber pagado. */
  reportedMinor: number;
  /** Reportado − esperado: negativo = pagó de menos. */
  differenceMinor: number;
  /** Cuánto se permite desviarse antes de resaltar. */
  toleranceMinor: number;
  /** true = el monto cuadra dentro de la tolerancia. */
  matches: boolean;
}

/**
 * Monto esperado del reporte, en la moneda que le corresponde.
 *
 * - Pago Móvil: precio del plan a la tasa CONGELADA en el propio reporte, no a
 *   la de hoy. Se le valida al dueño contra lo que vio cuando pagó.
 * - Binance / PayPal: el precio del plan en USD, sin tasa de por medio.
 */
export function expectedAmountMinor(input: DiscrepancyInput): number {
  const plan = getPlan(input.planId);
  if (input.method !== 'pago_movil') return plan.priceUsdMinor;
  // Sin tasa congelada no hay contra qué comparar: se toma lo reportado como
  // esperado para no marcar una discrepancia inventada.
  if (!input.frozenRate || input.frozenRate <= 0) {
    return input.amountVesMinor ?? 0;
  }
  return usdMinorToVesMinor(plan.priceUsdMinor, input.frozenRate);
}

/** Lo que el dueño reportó, en la moneda que le corresponde al método. */
export function reportedAmountMinor(input: DiscrepancyInput): number {
  return input.method === 'pago_movil'
    ? (input.amountVesMinor ?? 0)
    : (input.amountUsdMinor ?? 0);
}

/**
 * Compara reportado contra esperado con una banda de tolerancia en basis
 * points (100 bps = 1%). La tolerancia se calcula SOBRE el esperado y se
 * redondea hacia arriba: con montos chicos, redondear hacia abajo dejaría la
 * banda en cero y marcaría discrepancias por un céntimo.
 */
export function amountDiscrepancy(
  input: DiscrepancyInput,
  toleranceBps: number = DEFAULT_AMOUNT_TOLERANCE_BPS,
): AmountDiscrepancy {
  const expectedMinor = expectedAmountMinor(input);
  const reportedMinor = reportedAmountMinor(input);
  const toleranceMinor = Math.ceil(
    (Math.abs(expectedMinor) * Math.max(toleranceBps, 0)) / 10000,
  );
  const differenceMinor = reportedMinor - expectedMinor;

  return {
    currency: input.method === 'pago_movil' ? 'VES' : 'USD',
    expectedMinor,
    reportedMinor,
    differenceMinor,
    toleranceMinor,
    matches: Math.abs(differenceMinor) <= toleranceMinor,
  };
}
