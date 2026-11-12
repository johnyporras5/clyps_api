import type { PlanId } from '../config/plans.config';
import type { OfferId } from '../config/offers.config';
import type { PaymentKind } from '../payment-charge';

/**
 * Respuesta de POST /subscription/payments/checkout (SUB-10).
 *
 * Es el documento de cobro emitido en Cobrix con su enlace de pago. El dueño
 * puede pagar por el enlace —y Cobrix concilia solo— o pagar por fuera y
 * reportarlo como siempre (SUB-3): la factura queda abierta y el pago se casa
 * igual.
 *
 * Emitirla NO da acceso ni mueve la suscripción. Eso pasa cuando el pago se
 * confirma (SUB-6).
 */
export interface CheckoutResponse {
  /** Nuestro id de la factura. Es el que se guarda en el reporte. */
  invoiceId: number;
  /** La referencia que casa el webhook con esta factura. */
  providerReference: string;
  /** Enlace de pago de Cobrix. Se abre tal cual, no se arma a mano. */
  paymentLink: string | null;
  planId: PlanId;
  planName: string;
  kind: PaymentKind;
  offerId: OfferId | null;
  months: number;
  /** Monto facturado en unidades mínimas de `currency`. */
  amountMinor: number;
  /** El mismo monto ya legible ("22.259,77"). */
  amountFormatted: string;
  currency: string;
  /** Tasa con la que se calculó el monto en Bs. */
  frozenRate: number | null;
  quotedAt: string | null;
  /** Hasta cuándo vale el cobro. Vencido, se pide otro. */
  expiresAt: string;
  /** Con qué cédula/RIF se facturó: la app ya no vuelve a pedirla. */
  payerIdentification: string;
  /** true = se devolvió la factura que ya estaba viva, no se emitió otra. */
  reused: boolean;
}
