import type { PlanId } from '../config/plans.config';
import type { RateSourceId, RateType } from '../config/rate.config';

/**
 * Respuesta de GET /subscription/quote. NO se persiste nada: el cliente muestra
 * este monto y lo conserva para reportarlo (SUB-3), donde se congela.
 */
export interface QuoteResponse {
  planId: PlanId;
  planName: string;
  /** Base de precio del plan, en centavos de USD. */
  priceUsdMinor: number;
  /** Lo que hay que pagar, en céntimos de Bs. Es el monto que manda. */
  amountVesMinor: number;
  /**
   * El mismo monto ya legible ("22.259,77"). Solo para mostrar: lo que se
   * congela y se verifica es `amountVesMinor`.
   */
  amountVesFormatted: string;
  currency: string;
  /** Bs por 1 USD usada en el cálculo. */
  rate: number;
  /** Cuál tasa del BCV es: `oficial` (dólar) o `euro` (lo configura el back). */
  rateType: RateType;
  /** De dónde salió, para poder auditar un monto que alguien discuta. */
  rateSource: RateSourceId;
  rateSourceLabel: string;
  /** Cuándo se calculó. Viaja al reporte y se congela allí. */
  quotedAt: string;
  /** Hasta cuándo sirve. Pasado esto hay que recotizar. */
  validUntil: string;
}
