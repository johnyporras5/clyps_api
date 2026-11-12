import {
  DEFAULT_BF2026_WINDOW,
  OFFER_IDS,
  OFFERS,
  PROMO_UPGRADE,
  type Offer,
  type OfferId,
} from './config/offers.config';
import type { PlanId } from './config/plans.config';

/**
 * Reglas de la promo Black Friday. Puras a propósito: se prueban sin base de
 * datos y los servicios solo les pasan lo que leyeron.
 */

export interface OfferWindow {
  start: Date;
  /** Exclusivo: a esta hora exacta ya no vale. */
  end: Date;
}

/**
 * La ventana a partir de las variables de entorno.
 *
 * Un valor vacío o mal escrito NO abre ni cierra la promo por accidente: se usa
 * el valor por defecto de ese extremo y se devuelve el aviso para el log. Si el
 * fin quedara antes del inicio, se ignoran las dos variables.
 */
export function resolveOfferWindow(raw: {
  start?: string | null;
  end?: string | null;
}): { window: OfferWindow; warnings: string[] } {
  const warnings: string[] = [];
  const parse = (
    value: string | null | undefined,
    fallback: Date,
    label: string,
  ) => {
    const text = value?.trim();
    if (!text) return fallback;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      warnings.push(
        `${label} inválido ("${text}"): se usa ${fallback.toISOString()}.`,
      );
      return fallback;
    }
    return date;
  };

  const start = parse(raw.start, DEFAULT_BF2026_WINDOW.start, 'PROMO_BF_START');
  const end = parse(raw.end, DEFAULT_BF2026_WINDOW.end, 'PROMO_BF_END');
  if (end.getTime() <= start.getTime()) {
    warnings.push(
      'PROMO_BF_END no es posterior a PROMO_BF_START: se usa la ventana por defecto.',
    );
    return { window: { ...DEFAULT_BF2026_WINDOW }, warnings };
  }
  return { window: { start, end }, warnings };
}

export function isWindowOpen(window: OfferWindow, now: Date): boolean {
  const t = now.getTime();
  return t >= window.start.getTime() && t < window.end.getTime();
}

/** Lo que las reglas necesitan saber del salón. */
export interface OfferContext {
  now: Date;
  window: OfferWindow;
  /** VIP: no paga, no se le ofrece nada. */
  billingExempt: boolean;
  /**
   * Ya tiene un pago de ESTA campaña pendiente o verificado (una oferta o la
   * mejora). Uno rechazado no cuenta.
   */
  campaignTaken: boolean;
}

export type OfferBlockReason = 'window_closed' | 'vip' | 'already_taken';

/** `null` = puede tomarla; si no, por qué no. */
export function offerBlockReason(ctx: OfferContext): OfferBlockReason | null {
  if (ctx.billingExempt) return 'vip';
  if (!isWindowOpen(ctx.window, ctx.now)) return 'window_closed';
  if (ctx.campaignTaken) return 'already_taken';
  return null;
}

/** Las ofertas que se le muestran a este salón (vacío fuera de la ventana). */
export function availableOffers(ctx: OfferContext): Offer[] {
  return offerBlockReason(ctx) === null
    ? OFFER_IDS.map((id) => OFFERS[id])
    : [];
}

/** Mensajes para el dueño cuando intenta pagar una oferta que no le toca. */
export const OFFER_BLOCK_MESSAGES: Record<OfferBlockReason, string> = {
  window_closed: 'La promoción de Black Friday ya no está disponible.',
  vip: 'Tu salón es VIP: no necesitas pagar.',
  already_taken: 'Ya aprovechaste la promoción de Black Friday en este salón.',
};

/** Lo que la mejora a Full necesita saber del salón. */
export interface UpgradeContext {
  now: Date;
  billingExempt: boolean;
  /** Plan con el que opera hoy. */
  currentPlanId: PlanId | null;
  /** Oferta de la campaña que tiene VERIFICADA (no pendiente). */
  verifiedOfferId: OfferId | null;
  /** Hasta cuándo cubre esa oferta (fin de sus 3 meses). */
  offerCoversUntil: Date | null;
  /** Ya tiene una mejora pendiente o verificada. */
  upgradeTaken: boolean;
}

export type UpgradeBlockReason =
  | 'vip'
  | 'no_basic_promo'
  | 'not_on_basic'
  | 'promo_over'
  | 'already_upgraded';

/**
 * La mejora Básico → Full (+$30) solo existe mientras duren los 3 meses de la
 * promo Básico ya VERIFICADA. No depende de la ventana del Black Friday: se
 * puede pedir cualquier día de esos 3 meses.
 */
export function upgradeBlockReason(
  ctx: UpgradeContext,
): UpgradeBlockReason | null {
  if (ctx.billingExempt) return 'vip';
  if (ctx.verifiedOfferId !== PROMO_UPGRADE.from) return 'no_basic_promo';
  if (ctx.upgradeTaken) return 'already_upgraded';
  if (ctx.currentPlanId !== OFFERS[PROMO_UPGRADE.from].planId)
    return 'not_on_basic';
  if (
    !ctx.offerCoversUntil ||
    ctx.offerCoversUntil.getTime() <= ctx.now.getTime()
  )
    return 'promo_over';
  return null;
}

export const UPGRADE_BLOCK_MESSAGES: Record<UpgradeBlockReason, string> = {
  vip: 'Tu salón es VIP: no necesitas pagar.',
  no_basic_promo:
    'La mejora a Full es solo para quien tomó la promo Básico de Black Friday.',
  not_on_basic: 'Tu salón ya no está en el plan Básico.',
  promo_over:
    'Los 3 meses de tu promoción ya terminaron: puedes elegir Full en tu próxima renovación.',
  already_upgraded: 'Ya pediste pasarte a Full.',
};
