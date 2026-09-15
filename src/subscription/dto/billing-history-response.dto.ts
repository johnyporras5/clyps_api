import type { PlanId } from '../config/plans.config';
import type { GraceCause } from '../entitlements.util';
import type { PaginationResult } from '../../common/dto/pagination.dto';
import type {
  AutoCheckStatus,
  PaymentMethod,
  PaymentReportStatus,
  SubscriptionStatus,
  VerificationMethod,
} from '../subscription.enums';

/**
 * El ciclo de facturación que cubre un pago (SUB-13 / CLYP-342).
 *
 * En un pago VERIFICADO son las fechas congeladas en el propio reporte: el
 * historial no cambia porque después se haya pagado otro mes.
 *
 * En uno reportado o rechazado el ciclo todavía no existe —nadie compró nada—,
 * así que se muestra al que APUNTABA, calculado con el mismo encadenamiento que
 * usaría al verificarse. Eso va marcado con `estimated: true`: es una
 * proyección desde la suscripción de hoy, no un hecho.
 */
export interface BillingCycle {
  /** Desde cuándo cubre. ISO 8601. */
  from: string;
  /** Hasta cuándo cubre. ISO 8601. */
  to: string;
  /** true = el pago no está verificado y este rango es el que apuntaba. */
  estimated: boolean;
}

/** La suscripción tal como está hoy: la cabecera de la pantalla. */
export interface BillingHistorySubscription {
  /** Plan que el tenant USA ahora (en la prueba, el Full). */
  planId: PlanId;
  planName: string;
  /** El plan que COMPRÓ. null = todavía no eligió ninguno. */
  purchasedPlanId: PlanId | null;
  purchasedPlanName: string | null;
  /** Estado de acceso EFECTIVO, recalculado con las fechas. */
  status: SubscriptionStatus;
  /** Hasta cuándo llega el período pagado. null si nunca pagó. */
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  /**
   * Hasta cuándo llega el acceso: la más lejana de las dos fechas de arriba.
   *
   * Va servida y no calculada en la pantalla porque `trialEndsAt` y
   * `currentPeriodEnd` NO se borran al vencer: quedarse con una suelta es cómo
   * se termina anunciando una prueba que acabó hace dos días.
   */
  accessEndsAt: string | null;
  /**
   * La prueba TODAVÍA corre. Es lo único que distingue "estás en tu prueba" de
   * "tu prueba terminó": la fecha por sí sola dice las dos cosas.
   */
  onTrial: boolean;
  /** Por qué está en gracia: se le venció, o pagó y falta verificar. */
  graceCause: GraceCause;
  /** Tiene un pago esperando verificación: no se le debe insistir que pague. */
  hasPendingReport: boolean;
  /** No se le cobra: su historial puede estar vacío para siempre. */
  billingExempt: boolean;
}

/** Una fila del historial: un pago reportado por el tenant. */
export interface BillingHistoryItem {
  id: number;
  status: PaymentReportStatus;
  method: PaymentMethod;
  /** Plan que se estaba pagando, no el vigente hoy. */
  planId: PlanId;
  planName: string;
  /** Monto en la moneda del método, en unidades mínimas. */
  amountMinor: number;
  currency: string;
  /** El monto en Bs ya legible ("22.259,77"); null si el pago fue en USD. */
  amountVesFormatted: string | null;
  /** Tasa congelada al cotizar. Solo Pago Móvil. */
  frozenRate: number | null;
  reference: string;
  reportedAt: string;
  /** El ciclo que cubrió (o al que apuntaba, si no está verificado). */
  cycle: BillingCycle;
  verifiedAt: string | null;
  /** Por qué se rechazó. Solo en `rejected`. */
  rejectionReason: string | null;
  /**
   * En qué va la conciliación automática (SUB-10). `pending` es el "validando"
   * de la app; `null` = este pago no pasó por la pasarela.
   */
  autoCheckStatus: AutoCheckStatus | null;
}

/** El detalle de un pago: la fila más lo que no cabe en el listado. */
export interface BillingHistoryDetail extends BillingHistoryItem {
  /** Céntimos de Bs. null en Binance/PayPal. */
  amountVesMinor: number | null;
  /** Centavos de USD. null en Pago Móvil. */
  amountUsdMinor: number | null;
  quotedAt: string | null;
  payerPhone: string | null;
  payerBankCode: string | null;
  payerEmail: string | null;
  network: string | null;
  note: string | null;
  proofUrl: string | null;
  /**
   * Quién resolvió el pago: el conciliador automático o una persona. NO viaja
   * el id del admin que lo firmó: al dueño no le sirve y es dato interno.
   */
  verificationMethod: VerificationMethod | null;
  /** Motivo que dio la pasarela, si opinó. */
  autoCheckReason: string | null;
  autoCheckAt: string | null;
}

/**
 * Respuesta de GET /subscription/billing-history.
 *
 * Trae la cabecera junto a la página de pagos para que la pantalla se pinte de
 * una sola llamada: el dueño quiere ver "estoy en el Full hasta el 5 de
 * noviembre" y debajo lo que ha pagado.
 */
export interface BillingHistoryResponse extends PaginationResult<BillingHistoryItem> {
  subscription: BillingHistorySubscription;
}
