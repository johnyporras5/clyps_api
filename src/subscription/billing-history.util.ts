import { getPlan } from './config/plans.config';
import { CURRENCY_VES, formatVesMinor } from './subscription-money.util';
import { periodCoverage } from './subscription-period.util';
import type { PaymentReport } from './entities/payment-report.entity';
import type { Subscription } from './entities/subscription.entity';
import type {
  BillingCycle,
  BillingHistoryDetail,
  BillingHistoryItem,
} from './dto/billing-history-response.dto';

/**
 * Armado del historial de facturación del tenant (SUB-13 / CLYP-342).
 *
 * Puro a propósito: aquí no hay repositorios ni permisos, solo la traducción de
 * una fila de `payment_report` a lo que ve el dueño. El aislamiento por tenant
 * es responsabilidad del servicio, que es el único que consulta.
 */

/** Lo que hace falta de la suscripción para proyectar un ciclo no verificado. */
export interface CycleContext {
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
}

/**
 * El ciclo de facturación que le corresponde a un pago.
 *
 * VERIFICADO: las fechas congeladas al verificarlo. Son un hecho y no se
 * recalculan — recalcularlas con la suscripción de hoy haría que el pago de
 * septiembre dijera "octubre" en cuanto se pague octubre.
 *
 * NO verificado (reportado o rechazado): no compró ningún ciclo, así que se
 * proyecta al que apuntaba con el mismo encadenamiento que usaría SUB-6 —desde
 * lo que el tenant ya tiene, no desde la fecha del pago— y se marca
 * `estimated`. Un rechazado viejo puede quedar apuntando a un mes que ya pasó:
 * es correcto, ese pago nunca cubrió nada.
 *
 * Un verificado SIN fechas congeladas (los anteriores a CLYP-342 que la
 * migración no pudo rellenar por no tener evento) cae también en la
 * proyección: es preferible un rango marcado como estimado a un hueco.
 */
export function billingCycleOf(
  report: Pick<PaymentReport, 'status' | 'reportedAt' | 'coveredFrom'> & {
    coveredTo: Date | null;
  },
  context: CycleContext,
): BillingCycle {
  if (report.coveredFrom && report.coveredTo)
    return {
      from: report.coveredFrom.toISOString(),
      to: report.coveredTo.toISOString(),
      estimated: false,
    };

  const projected = periodCoverage(
    report.reportedAt,
    context.currentPeriodEnd,
    context.trialEndsAt,
  );
  return {
    from: projected.from.toISOString(),
    to: projected.to.toISOString(),
    estimated: true,
  };
}

/** Monto del pago en la moneda de su método, en unidades mínimas. */
function amountMinorOf(report: PaymentReport): number {
  const minor =
    report.currency === CURRENCY_VES
      ? report.amountVesMinor
      : report.amountUsdMinor;
  // Un reporte sin monto en su propia moneda no debería existir, pero el
  // historial no es el lugar para reventar por eso: se muestra en cero.
  return minor ?? 0;
}

/** Una fila del listado. */
export function toHistoryItem(
  report: PaymentReport,
  context: CycleContext,
): BillingHistoryItem {
  return {
    id: report.id,
    status: report.status,
    method: report.method,
    planId: report.planId,
    planName: getPlan(report.planId).name,
    amountMinor: amountMinorOf(report),
    currency: report.currency,
    amountVesFormatted:
      report.amountVesMinor === null
        ? null
        : formatVesMinor(report.amountVesMinor),
    frozenRate: report.frozenRate,
    reference: report.reference,
    reportedAt: report.reportedAt.toISOString(),
    cycle: billingCycleOf(report, context),
    verifiedAt: report.verifiedAt ? report.verifiedAt.toISOString() : null,
    rejectionReason: report.rejectionReason,
    autoCheckStatus: report.autoCheckStatus,
  };
}

/** El detalle de un pago. Es la fila más los datos del método y el comprobante. */
export function toHistoryDetail(
  report: PaymentReport,
  context: CycleContext,
): BillingHistoryDetail {
  return {
    ...toHistoryItem(report, context),
    amountVesMinor: report.amountVesMinor,
    amountUsdMinor: report.amountUsdMinor,
    quotedAt: report.quotedAt ? report.quotedAt.toISOString() : null,
    payerPhone: report.payerPhone,
    payerBankCode: report.payerBankCode,
    payerEmail: report.payerEmail,
    network: report.network,
    note: report.note,
    proofUrl: report.proofUrl,
    verificationMethod: report.verificationMethod,
    autoCheckReason: report.autoCheckReason,
    autoCheckAt: report.autoCheckAt ? report.autoCheckAt.toISOString() : null,
  };
}

/** El contexto de proyección que sale de la suscripción del tenant. */
export function cycleContextOf(
  subscription: Subscription | null,
): CycleContext {
  return {
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
  };
}
