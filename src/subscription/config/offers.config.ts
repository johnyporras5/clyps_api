import type { PlanId } from './plans.config';

/**
 * Ofertas por tiempo limitado (promo Black Friday 2026).
 *
 * Igual que los planes, viven en CÓDIGO: el precio de una oferta es una
 * decisión de producto y NUNCA viene del front. El front solo dice "quiero la
 * oferta X"; el monto sale siempre de aquí.
 *
 * Una oferta paga varios meses de un plan de una sola vez y más barato:
 *   - Básico 3 meses: $30 (normal $45)
 *   - Full   3 meses: $60 (normal $84)
 *
 * Reglas (ver `offers.util.ts`):
 *   - Solo dentro de la ventana de la campaña: por defecto UNA SEMANA desde el
 *     Black Friday, del 27/11/2026 al 03/12/2026 incluido, hora de Venezuela.
 *     Se mueve por variable de entorno, sin deploy.
 *   - Para cualquier salón que pague (no VIP), en prueba, pagando o bloqueado.
 *   - UNA sola vez por salón (cuenta una pendiente o verificada; una
 *     rechazada no, porque no se la llevó).
 *   - Quien tomó la de Básico puede pasarse a Full pagando la diferencia
 *     mientras le duren los 3 meses (ver `PROMO_UPGRADE`).
 *   - Al terminar los 3 meses renueva al precio mensual normal.
 */

export type OfferId = 'bf2026_basico' | 'bf2026_full';

/** La campaña a la que pertenece cada oferta: "una vez" se cuenta por campaña. */
export type CampaignId = 'bf2026';

export interface Offer {
  id: OfferId;
  campaign: CampaignId;
  planId: PlanId;
  /** Meses que suma al verificarse el pago. */
  months: number;
  /** Precio de la oferta completa, en centavos de USD. */
  priceUsdMinor: number;
  /** Lo que costarían esos meses al precio normal, para el "antes $45". */
  regularUsdMinor: number;
  name: string;
}

export const OFFERS: Record<OfferId, Offer> = {
  bf2026_basico: {
    id: 'bf2026_basico',
    campaign: 'bf2026',
    planId: 'basico',
    months: 3,
    priceUsdMinor: 3000,
    regularUsdMinor: 4500,
    name: 'Black Friday · Básico 3 meses',
  },
  bf2026_full: {
    id: 'bf2026_full',
    campaign: 'bf2026',
    planId: 'full',
    months: 3,
    priceUsdMinor: 6000,
    regularUsdMinor: 8400,
    name: 'Black Friday · Full 3 meses',
  },
};

export const OFFER_IDS: OfferId[] = Object.keys(OFFERS) as OfferId[];

/**
 * Pasarse de la promo Básico a la promo Full: se paga la diferencia entre las
 * dos ofertas ($60 − $30 = $30), fija, sin prorratear. Cambia el plan al
 * instante y NO toca la fecha de fin.
 */
export const PROMO_UPGRADE: {
  from: OfferId;
  to: OfferId;
  priceUsdMinor: number;
} = {
  from: 'bf2026_basico',
  to: 'bf2026_full',
  priceUsdMinor:
    OFFERS.bf2026_full.priceUsdMinor - OFFERS.bf2026_basico.priceUsdMinor,
};

/**
 * Ventana por defecto: una semana desde el Black Friday. Del viernes
 * 27/11/2026 00:00 al jueves 03/12/2026 23:59:59 en Caracas (UTC-4, sin horario
 * de verano): 7 días completos. El fin es EXCLUSIVO (04/12 00:00).
 */
export const DEFAULT_BF2026_WINDOW = {
  start: new Date('2026-11-27T04:00:00.000Z'),
  end: new Date('2026-12-04T04:00:00.000Z'),
};

/** Variables de entorno que mueven la ventana sin deploy de código. */
export const OFFER_WINDOW_ENV = {
  start: 'PROMO_BF_START',
  end: 'PROMO_BF_END',
} as const;

export function isOfferId(value: unknown): value is OfferId {
  return typeof value === 'string' && (OFFER_IDS as string[]).includes(value);
}

/** Oferta por id. Lanza si no existe: una oferta desconocida es un bug. */
export function getOffer(offerId: OfferId): Offer {
  const offer = OFFERS[offerId];
  if (!offer) throw new Error(`Oferta desconocida: ${String(offerId)}`);
  return offer;
}
