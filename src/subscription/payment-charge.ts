import { getOffer, type OfferId } from './config/offers.config';
import { getPlan, type PlanId } from './config/plans.config';

/**
 * Qué se está cobrando en un pago: el mes normal de un plan, una oferta de
 * varios meses, o la mejora Básico → Full de la promo.
 *
 * Se decide UNA vez en el servidor (al cotizar / abrir el cobro / reportar) y se
 * congela en el pago y en la factura de Cobrix. El front nunca manda un precio.
 */
export type PaymentKind = 'regular' | 'promo' | 'promo_upgrade';

export const PAYMENT_KINDS: PaymentKind[] = [
  'regular',
  'promo',
  'promo_upgrade',
];

export interface PaymentCharge {
  kind: PaymentKind;
  /** Plan que queda activo al verificarse. */
  planId: PlanId;
  offerId: OfferId | null;
  /** Meses que suma al verificarse. 0 = la mejora (no mueve la fecha). */
  months: number;
  /** Lo que se cobra, en centavos de USD. */
  priceUsdMinor: number;
  /** Nombre para mostrar ("Full", "Black Friday · Full 3 meses"…). */
  label: string;
}

/** Las columnas que lo congelan en `payment_report` / `subscription_invoice`. */
export interface ChargeColumns {
  planId: PlanId;
  kind: PaymentKind;
  offerId: OfferId | null;
  months: number;
  priceUsdMinor: number | null;
}

export function regularCharge(planId: PlanId): PaymentCharge {
  const plan = getPlan(planId);
  return {
    kind: 'regular',
    planId,
    offerId: null,
    months: 1,
    priceUsdMinor: plan.priceUsdMinor,
    label: plan.name,
  };
}

export function chargeColumns(charge: PaymentCharge): ChargeColumns {
  return {
    planId: charge.planId,
    kind: charge.kind,
    offerId: charge.offerId,
    months: charge.months,
    priceUsdMinor: charge.priceUsdMinor,
  };
}

/**
 * El precio que se esperaba en un pago ya guardado. Los anteriores a la promo
 * no tienen `price_usd_minor`: para ellos manda el precio del plan.
 */
export function expectedPriceUsdMinor(row: {
  planId: PlanId;
  priceUsdMinor?: number | null;
}): number {
  return row.priceUsdMinor ?? getPlan(row.planId).priceUsdMinor;
}

/** Meses que suma un pago guardado (1 en los de antes). */
export function monthsOf(row: { months?: number | null }): number {
  return row.months ?? 1;
}

/** Nombre del cargo de un pago guardado, para el historial y el panel. */
export function chargeLabel(row: {
  planId: PlanId;
  kind?: PaymentKind | null;
  offerId?: string | null;
}): string {
  if (row.kind === 'promo_upgrade') return 'Black Friday · Mejora a Full';
  if (row.kind === 'promo' && row.offerId) {
    try {
      return getOffer(row.offerId as OfferId).name;
    } catch {
      return `Promoción (${row.offerId})`;
    }
  }
  return getPlan(row.planId).name;
}
