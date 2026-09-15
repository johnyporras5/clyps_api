/**
 * El pago que se rechazó (SUB-9 / CLYP-340).
 *
 * La activación ya tenía su evento (`SUBSCRIPTION_ACTIVATED`, en
 * `SubscriptionService`) porque el pago verificado mueve la suscripción. El
 * rechazo no mueve nada —esa es justo su definición— así que necesita el suyo
 * para poder avisar.
 *
 * Va por evento y no llamando al notificador desde `PaymentsService` para que
 * verificar o rechazar no dependa de que el aviso salga: si el correo falla, el
 * pago igual quedó rechazado.
 */
export const SUBSCRIPTION_PAYMENT_REJECTED = 'subscription.payment.rejected';

export interface SubscriptionPaymentRejectedEvent {
  companyId: number;
  paymentReportId: number;
  /** Motivo escrito por quien revisó. Obligatorio al rechazar. */
  reason: string;
  /** Referencia del pago, para que el dueño sepa cuál de sus pagos fue. */
  reference: string | null;
}
