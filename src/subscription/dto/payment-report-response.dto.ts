import type { PlanId } from '../config/plans.config';
import type {
  AutoCheckStatus,
  PaymentMethod,
  PaymentReportStatus,
} from '../subscription.enums';

/**
 * Respuesta de POST /subscription/payments/report.
 *
 * Devuelve el reclamo tal como quedó guardado. `status: 'reported'` NO da
 * acceso: el plan se activa cuando el pago se verifica (SUB-4/SUB-5).
 */
export interface PaymentReportResponse {
  id: number;
  status: PaymentReportStatus;
  method: PaymentMethod;
  planId: PlanId;
  /** Céntimos de Bs, solo Pago Móvil. */
  amountVesMinor: number | null;
  /** El mismo monto legible ("22.259,77"). null si el pago fue en USD. */
  amountVesFormatted: string | null;
  /** Centavos de USD, solo Binance/PayPal. */
  amountUsdMinor: number | null;
  currency: string;
  /** Tasa congelada al cotizar, solo Pago Móvil. */
  frozenRate: number | null;
  reference: string;
  /** URL del comprobante ya subido, si el dueño mandó la foto. */
  proofUrl: string | null;
  reportedAt: string;
  /**
   * En qué va la conciliación automática (SUB-10). `pending` es el "validando"
   * que muestra la app mientras Cobrix responde; `null` significa que este
   * pago lo revisa una persona y nada más. Ninguno de los dos quita el acceso:
   * un reporte pendiente no bloquea.
   */
  autoCheckStatus: AutoCheckStatus | null;
  /** Los recordatorios de cobro quedan en pausa mientras esté por verificar. */
  remindersPaused: boolean;
}
