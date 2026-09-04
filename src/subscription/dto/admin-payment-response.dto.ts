import type { PlanId } from '../config/plans.config';
import type { AmountDiscrepancy } from '../payment-discrepancy.util';
import type {
  AutoCheckStatus,
  PaymentMethod,
  PaymentReportStatus,
  SubscriptionStatus,
  VerificationMethod,
} from '../subscription.enums';

/** Datos del método que el admin revisa. Solo vienen los que aplican. */
export interface AdminPaymentMethodData {
  reference: string;
  payerPhone: string | null;
  payerBankCode: string | null;
  payerEmail: string | null;
  network: string | null;
}

/**
 * Qué contestó el conciliador automático sobre este reporte (SUB-10).
 *
 * Es la explicación de por qué el pago sigue en la cola manual: Cobrix lo
 * rechazó, no cubre el método, o nunca respondió. `approved` casi no se ve
 * aquí — ese reporte ya salió de la cola verificado.
 */
export interface AdminPaymentAutoCheck {
  status: AutoCheckStatus;
  /** Motivo tal como lo mandó Cobrix. */
  reason: string | null;
  at: string | null;
  /** El `paymentId` de Cobrix, para buscarlo en su panel. */
  gatewayPaymentId: string | null;
}

/** Una fila de la cola de verificación (SUB-4). */
export interface AdminPaymentItem {
  id: number;
  status: PaymentReportStatus;
  method: PaymentMethod;
  /** El tenant: quién reportó el pago. */
  company: { id: number; name: string | null };
  planId: PlanId;
  planName: string;
  /** Monto reportado, en la moneda del método. */
  amountMinor: number;
  currency: string;
  /** El monto en Bs ya legible ("22.259,77"); null si el pago fue en USD. */
  amountVesFormatted: string | null;
  /** Tasa congelada al cotizar. Solo Pago Móvil. */
  frozenRate: number | null;
  quotedAt: string | null;
  methodData: AdminPaymentMethodData;
  proofUrl: string | null;
  note: string | null;
  reportedAt: string;
  /**
   * Comparación contra el monto esperado. `matches: false` es la marca de
   * "monto no coincide": se resalta, pero NO rechaza nada solo.
   */
  discrepancy: AmountDiscrepancy;
  /** null = este reporte nunca pasó por la conciliación automática. */
  autoCheck: AdminPaymentAutoCheck | null;
  verificationMethod: VerificationMethod | null;
  verifiedByUserId: number | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
}

/** Respuesta de verificar o rechazar un pago. */
export interface AdminPaymentDecisionResponse {
  id: number;
  status: PaymentReportStatus;
  verificationMethod: VerificationMethod | null;
  verifiedByUserId: number | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  /** Cómo quedó la suscripción del tenant después de la decisión. */
  subscription: {
    companyId: number;
    planId: PlanId;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
  };
}
