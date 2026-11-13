import { isWindowOpen, type OfferWindow } from '../subscription/offers.util';
import type { CampaignId } from './campaign-email.template';

/**
 * Cuándo sale sola cada campaña de la promo Black Friday.
 *
 * Puras a propósito: el cron solo pregunta "¿toca ahora?" y estas reglas se
 * prueban sin base de datos ni reloj real.
 */

/** Por defecto, hora de Caracas (UTC-4, sin horario de verano). */
export const DEFAULT_CAMPAIGN_SCHEDULE: Record<CampaignId, Date> = {
  // Viernes 20/11 a las 10:00 a. m. (la promo abre el lunes 23).
  bf2026_teaser: new Date('2026-11-20T14:00:00.000Z'),
  // Lunes 23/11 a las 8:00 a. m.: el mismo día que abre la promo.
  bf2026_launch: new Date('2026-11-23T12:00:00.000Z'),
};

/** Variables de entorno que mueven cada fecha sin deploy de código. */
export const CAMPAIGN_SCHEDULE_ENV: Record<CampaignId, string> = {
  bf2026_teaser: 'CAMPAIGN_BF_TEASER_AT',
  bf2026_launch: 'CAMPAIGN_BF_LAUNCH_AT',
};

/** Una fecha mal escrita NO adelanta un envío masivo: se usa la de defecto. */
export function resolveScheduledAt(
  campaign: CampaignId,
  raw: string | null | undefined,
): Date {
  const text = raw?.trim();
  if (text) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return DEFAULT_CAMPAIGN_SCHEDULE[campaign];
}

export type CampaignPhase =
  /** Todavía no llega su hora. */
  | 'scheduled'
  /** Es su momento: el cron la manda (o completa la que se cortó). */
  | 'due'
  /** Ya pasó su momento: no se manda más (aunque falten salones). */
  | 'closed';

/**
 * - Intriga: desde su hora y hasta que abre la promo. Después de abierta, un
 *   "se acerca el Black Friday" ya no tiene sentido.
 * - Promoción: desde su hora y mientras la promo esté abierta. Con la promo
 *   cerrada prometería algo que la app ya no muestra.
 */
export function campaignPhase(
  campaign: CampaignId,
  scheduledAt: Date,
  window: OfferWindow,
  now: Date,
): CampaignPhase {
  if (now.getTime() < scheduledAt.getTime()) return 'scheduled';
  if (campaign === 'bf2026_teaser')
    return now.getTime() < window.start.getTime() ? 'due' : 'closed';
  return isWindowOpen(window, now) ? 'due' : 'closed';
}
