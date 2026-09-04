import { BadRequestException } from '@nestjs/common';
import type { PlanId } from './config/plans.config';
import type { ReportPaymentDto } from './dto/report-payment.dto';
import { CURRENCY_USD, CURRENCY_VES } from './subscription-money.util';
import type { FrozenQuote } from './subscription-quote.util';
import type { AutoCheckStatus } from './subscription.enums';

/**
 * Armado del reporte de pago (SUB-3 / CLYP-335).
 *
 * Traduce lo que envía el dueño a la fila que se guarda, y aplica las reglas
 * que cruzan campos —las que `class-validator` no puede expresar campo por
 * campo—. Es pura: no toca BD ni red, así que las reglas se prueban solas.
 */

/** Datos que no vienen del body: salen del token y de la suscripción. */
export interface ReportContext {
  companyId: number;
  subscriptionId: number;
  planId: PlanId;
  reportedAt: Date;
  /**
   * Con qué marca de conciliación automática nace el reporte (SUB-10):
   * `pending` si hay un cobro emitido en Cobrix esperando este pago,
   * `unsupported` si no lo hay o el método no se concilia, `null` si la
   * integración está apagada. Lo decide el servicio, que es quien lee la
   * configuración.
   */
  autoCheckStatus?: AutoCheckStatus | null;
  autoCheckReason?: string | null;
  /** La factura de Cobrix contra la que se está pagando. */
  invoiceId?: number | null;
  /** Cédula o RIF con el que se emitió esa factura. */
  payerIdentification?: string | null;
}

/** La fila lista para insertar en `payment_report`. */
export interface PaymentReportDraft {
  companyId: number;
  subscriptionId: number;
  planId: PlanId;
  method: ReportPaymentDto['method'];
  amountVesMinor: number | null;
  amountUsdMinor: number | null;
  currency: string;
  frozenRate: number | null;
  quotedAt: Date | null;
  reference: string;
  payerPhone: string | null;
  payerBankCode: string | null;
  payerEmail: string | null;
  network: string | null;
  proofUrl: string | null;
  note: string | null;
  reportedAt: Date;
  status: 'reported';
  autoCheckStatus: AutoCheckStatus | null;
  autoCheckAt: Date | null;
  autoCheckReason: string | null;
  invoiceId: number | null;
  payerIdentification: string | null;
  verificationMethod: null;
}

/**
 * La referencia con la que se identifica el pago: la del Pago Móvil o el txId
 * de Binance/PayPal. Es la llave del anti-duplicado por tenant, por eso se
 * normaliza (sin espacios, mayúsculas) — la misma referencia escrita distinto
 * sigue siendo la misma referencia.
 */
export function paymentReference(dto: ReportPaymentDto): string {
  const raw = dto.method === 'pago_movil' ? dto.reference : dto.txId;
  return (raw ?? '').trim().toUpperCase();
}

/**
 * La cotización congelada que el cliente devuelve al reportar en Bs. El
 * servicio la revalida contra la tasa del momento antes de guardar (SUB-2).
 */
export function frozenQuoteOf(
  dto: ReportPaymentDto,
  planId: PlanId,
): FrozenQuote {
  return {
    planId,
    amountVesMinor: dto.amountVesMinor ?? 0,
    frozenRate: dto.frozenRate ?? 0,
    quotedAt: new Date(dto.quotedAt ?? ''),
  };
}

/**
 * Convierte el reporte del dueño en la fila a guardar.
 *
 * El monto va SOLO en la columna de su moneda: un pago en Bs no escribe
 * `amount_usd_minor` aunque el body lo traiga, y viceversa. Así la fila nunca
 * dice dos cosas a la vez, que es justo lo que el CHECK de la migración exige.
 */
export function buildPaymentReportDraft(
  dto: ReportPaymentDto,
  context: ReportContext,
): PaymentReportDraft {
  const reference = paymentReference(dto);
  if (!reference) {
    throw new BadRequestException(
      dto.method === 'pago_movil'
        ? 'Falta la referencia del pago móvil.'
        : 'Falta el identificador de la transacción (txId).',
    );
  }

  const isPagoMovil = dto.method === 'pago_movil';
  if (isPagoMovil && !Number.isFinite(new Date(dto.quotedAt ?? '').getTime())) {
    throw new BadRequestException('La fecha de la cotización no es válida.');
  }

  return {
    companyId: context.companyId,
    subscriptionId: context.subscriptionId,
    planId: context.planId,
    method: dto.method,
    amountVesMinor: isPagoMovil ? (dto.amountVesMinor ?? null) : null,
    amountUsdMinor: isPagoMovil ? null : (dto.amountUsdMinor ?? null),
    currency: isPagoMovil ? CURRENCY_VES : CURRENCY_USD,
    frozenRate: isPagoMovil ? (dto.frozenRate ?? null) : null,
    quotedAt: isPagoMovil ? new Date(dto.quotedAt ?? '') : null,
    reference,
    payerPhone: isPagoMovil ? (dto.payerPhone ?? null) : null,
    payerBankCode: isPagoMovil ? (dto.payerBankCode ?? null) : null,
    // El correo solo tiene sentido en PayPal; en Binance no identifica a nadie.
    payerEmail: dto.method === 'paypal' ? (dto.payerEmail ?? null) : null,
    network: dto.method === 'binance' ? (dto.network ?? null) : null,
    proofUrl: dto.proofUrl ?? null,
    note: dto.note ?? null,
    reportedAt: context.reportedAt,
    // Reportar NO da acceso: el reporte nace como un reclamo por verificar.
    status: 'reported',
    // Nace esperando a Cobrix (SUB-10) sin dejar de ser un reclamo: quien lo
    // resuelva —el webhook o el admin— es otra historia.
    autoCheckStatus: context.autoCheckStatus ?? null,
    autoCheckAt: context.autoCheckStatus ? context.reportedAt : null,
    autoCheckReason: context.autoCheckReason ?? null,
    invoiceId: context.invoiceId ?? null,
    payerIdentification: context.payerIdentification ?? null,
    verificationMethod: null,
  };
}
