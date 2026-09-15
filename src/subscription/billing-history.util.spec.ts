import { PaymentReport } from './entities/payment-report.entity';
import {
  billingCycleOf,
  toHistoryDetail,
  toHistoryItem,
} from './billing-history.util';

/**
 * SUB-13 (CLYP-342): qué ciclo de facturación se le muestra a cada pago.
 *
 * La regla que sostiene todo el historial: un pago VERIFICADO enseña el rango
 * que se congeló al verificarlo, y ninguno más. Uno sin verificar enseña el
 * rango al que APUNTABA, marcado como estimado.
 */

function reportFixture(overrides: Partial<PaymentReport> = {}): PaymentReport {
  const report = new PaymentReport();
  Object.assign(report, {
    id: 1,
    companyId: 7,
    subscriptionId: 3,
    planId: 'full',
    method: 'pago_movil',
    amountVesMinor: 2225977,
    amountUsdMinor: null,
    currency: 'VES',
    frozenRate: 794.9917,
    quotedAt: new Date('2026-09-05T15:40:52.291Z'),
    reference: '004512',
    payerPhone: '04141234567',
    payerBankCode: '0102',
    payerEmail: null,
    network: null,
    proofUrl: null,
    note: null,
    reportedAt: new Date('2026-09-05T16:00:00.000Z'),
    status: 'reported',
    verificationMethod: null,
    verifiedByUserId: null,
    verifiedAt: null,
    rejectionReason: null,
    autoCheckStatus: null,
    autoCheckAt: null,
    autoCheckReason: null,
    gatewayPaymentId: null,
    coveredFrom: null,
    coveredTo: null,
    ...overrides,
  });
  return report;
}

const sinNada = { currentPeriodEnd: null, trialEndsAt: null };

describe('el ciclo que se muestra en el historial', () => {
  it('un pago verificado enseña el rango que se le congeló', () => {
    const cycle = billingCycleOf(
      reportFixture({
        status: 'verified',
        coveredFrom: new Date('2026-10-05T16:00:00.000Z'),
        coveredTo: new Date('2026-11-05T16:00:00.000Z'),
      }),
      // La suscripción de HOY ya va por otro mes: no debe influir.
      {
        currentPeriodEnd: new Date('2026-12-05T16:00:00.000Z'),
        trialEndsAt: null,
      },
    );

    expect(cycle).toEqual({
      from: '2026-10-05T16:00:00.000Z',
      to: '2026-11-05T16:00:00.000Z',
      estimated: false,
    });
  });

  it('un pago por verificar enseña el ciclo al que apunta, marcado', () => {
    const cycle = billingCycleOf(reportFixture({ status: 'reported' }), {
      currentPeriodEnd: new Date('2026-09-20T16:00:00.000Z'),
      trialEndsAt: null,
    });

    // Encadena a lo que ya tiene, igual que haría al verificarse.
    expect(cycle).toEqual({
      from: '2026-09-20T16:00:00.000Z',
      to: '2026-10-20T16:00:00.000Z',
      estimated: true,
    });
  });

  it('un pago rechazado también muestra a qué mes apuntaba', () => {
    const cycle = billingCycleOf(
      reportFixture({
        status: 'rejected',
        rejectionReason: 'No aparece el pago.',
      }),
      sinNada,
    );

    // Sin período ni prueba, el mes corría desde la fecha del reporte.
    expect(cycle).toEqual({
      from: '2026-09-05T16:00:00.000Z',
      to: '2026-10-05T16:00:00.000Z',
      estimated: true,
    });
  });

  it('un pago hecho en la prueba apunta al mes que empieza al vencer ella', () => {
    const cycle = billingCycleOf(reportFixture(), {
      currentPeriodEnd: null,
      trialEndsAt: new Date('2026-09-15T16:00:00.000Z'),
    });

    expect(cycle.from).toBe('2026-09-15T16:00:00.000Z');
    expect(cycle.to).toBe('2026-10-15T16:00:00.000Z');
  });

  it('un verificado viejo sin rango guardado se estima, no se deja vacío', () => {
    const cycle = billingCycleOf(
      reportFixture({ status: 'verified', coveredFrom: null, coveredTo: null }),
      sinNada,
    );

    expect(cycle.estimated).toBe(true);
    expect(cycle.from).toBe('2026-09-05T16:00:00.000Z');
  });
});

describe('la fila del historial', () => {
  it('trae el monto en Bs legible y el plan que se pagaba', () => {
    const item = toHistoryItem(
      reportFixture({
        status: 'verified',
        planId: 'basico',
        verifiedAt: new Date('2026-09-06T10:00:00.000Z'),
        coveredFrom: new Date('2026-09-05T16:00:00.000Z'),
        coveredTo: new Date('2026-10-05T16:00:00.000Z'),
      }),
      sinNada,
    );

    expect(item).toMatchObject({
      id: 1,
      status: 'verified',
      planId: 'basico',
      amountMinor: 2225977,
      currency: 'VES',
      reference: '004512',
      verifiedAt: '2026-09-06T10:00:00.000Z',
    });
    expect(item.amountVesFormatted).toContain('22.259');
    expect(item.cycle.estimated).toBe(false);
  });

  it('en Binance el monto sale en USD y no hay Bs que formatear', () => {
    const item = toHistoryItem(
      reportFixture({
        method: 'binance',
        currency: 'USD',
        amountVesMinor: null,
        amountUsdMinor: 2500,
        frozenRate: null,
      }),
      sinNada,
    );

    expect(item.amountMinor).toBe(2500);
    expect(item.currency).toBe('USD');
    expect(item.amountVesFormatted).toBeNull();
  });

  it('el detalle no filtra quién firmó la verificación', () => {
    const detail = toHistoryDetail(
      reportFixture({
        status: 'verified',
        verificationMethod: 'manual',
        verifiedByUserId: 42,
        note: 'Pagué desde la cuenta de mi esposa.',
      }),
      sinNada,
    );

    expect(detail.verificationMethod).toBe('manual');
    // El id del admin de plataforma es dato interno: no viaja al tenant.
    expect(detail).not.toHaveProperty('verifiedByUserId');
    expect(detail.note).toBe('Pagué desde la cuenta de mi esposa.');
  });
});
