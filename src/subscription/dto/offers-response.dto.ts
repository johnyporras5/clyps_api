import type { PlanId } from '../config/plans.config';
import type { OfferId } from '../config/offers.config';

/** Una oferta tal como la pinta la pantalla de pago. */
export interface OfferItem {
  id: OfferId;
  name: string;
  planId: PlanId;
  planName: string;
  months: number;
  /** Lo que se paga, en centavos de USD. */
  priceUsdMinor: number;
  /** Lo que costarían esos meses al precio normal ("antes $45"). */
  regularUsdMinor: number;
  /** regular − precio ("ahorras $15"). */
  savingsUsdMinor: number;
}

/** Respuesta de GET /subscription/offers. */
export interface OffersResponse {
  campaign: string;
  /** Ventana de la campaña (ISO). El front puede mostrar "termina el 3/12". */
  windowStart: string;
  windowEnd: string;
  /** Ya tomó la promo (pendiente o verificada). */
  taken: boolean;
  /** Vacío fuera de la ventana, si es VIP o si ya la tomó. */
  offers: OfferItem[];
  /** La mejora Básico → Full, si le corresponde ahora. */
  upgrade: {
    priceUsdMinor: number;
    toPlanId: PlanId;
    /** Hasta cuándo le dura (fin de los 3 meses de su promo). */
    coversUntil: string;
  } | null;
}

/** Respuesta PÚBLICA de GET /public/promo (landing): sin datos de ningún salón. */
export interface PublicOffersResponse {
  windowStart: string;
  windowEnd: string;
  /** Vacío fuera de la semana de la promo. */
  offers: OfferItem[];
}
