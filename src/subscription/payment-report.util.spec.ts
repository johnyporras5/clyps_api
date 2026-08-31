import { BadRequestException } from '@nestjs/common';
import {
  buildPaymentReportDraft,
  frozenQuoteOf,
  paymentReference,
  type ReportContext,
} from './payment-report.util';
import type { ReportPaymentDto } from './dto/report-payment.dto';

const CONTEXT: ReportContext = {
  companyId: 7,
  subscriptionId: 3,
  planId: 'full',
  reportedAt: new Date('2026-08-31T16:00:00.000Z'),
};

const PAGO_MOVIL: ReportPaymentDto = {
  method: 'pago_movil',
  amountVesMinor: 2225977,
  frozenRate: 794.9917,
  quotedAt: '2026-08-31T15:40:52.291Z',
  reference: '004512',
  payerPhone: '04141234567',
  payerBankCode: '0102',
};

const BINANCE: ReportPaymentDto = {
  method: 'binance',
  amountUsdMinor: 2800,
  txId: '0xabc123def456',
  network: 'BEP20',
};

describe('paymentReference', () => {
  it('usa la referencia en Pago Móvil y el txId en los demás', () => {
    expect(paymentReference(PAGO_MOVIL)).toBe('004512');
    expect(paymentReference(BINANCE)).toBe('0XABC123DEF456');
  });

  it('normaliza para que la misma referencia escrita distinto sea la misma', () => {
    expect(paymentReference({ ...PAGO_MOVIL, reference: ' 004512 ' })).toBe(
      '004512',
    );
    expect(paymentReference({ ...BINANCE, txId: '0xAbC123DeF456' })).toBe(
      '0XABC123DEF456',
    );
  });
});

describe('frozenQuoteOf', () => {
  it('arma la cotización que el servicio revalida contra la tasa de hoy', () => {
    expect(frozenQuoteOf(PAGO_MOVIL, 'full')).toEqual({
      planId: 'full',
      amountVesMinor: 2225977,
      frozenRate: 794.9917,
      quotedAt: new Date('2026-08-31T15:40:52.291Z'),
    });
  });
});

describe('buildPaymentReportDraft', () => {
  it('congela monto, tasa y momento de la cotización en Pago Móvil', () => {
    const draft = buildPaymentReportDraft(PAGO_MOVIL, CONTEXT);

    expect(draft).toMatchObject({
      companyId: 7,
      subscriptionId: 3,
      planId: 'full',
      method: 'pago_movil',
      amountVesMinor: 2225977,
      currency: 'VES',
      frozenRate: 794.9917,
      quotedAt: new Date('2026-08-31T15:40:52.291Z'),
      reference: '004512',
      payerPhone: '04141234567',
      payerBankCode: '0102',
      status: 'reported',
      verificationMethod: null,
    });
    // El pago fue en Bs: la columna de dólares queda vacía.
    expect(draft.amountUsdMinor).toBeNull();
  });

  it('guarda el pago en dólares sin tocar las columnas de Bs', () => {
    const draft = buildPaymentReportDraft(BINANCE, CONTEXT);

    expect(draft).toMatchObject({
      method: 'binance',
      amountUsdMinor: 2800,
      currency: 'USD',
      reference: '0XABC123DEF456',
      network: 'BEP20',
    });
    expect(draft.amountVesMinor).toBeNull();
    expect(draft.frozenRate).toBeNull();
    expect(draft.quotedAt).toBeNull();
  });

  it('ignora los campos que no corresponden al método', () => {
    // Un body que trae de todo no debe ensuciar la fila: manda el método.
    const draft = buildPaymentReportDraft(
      {
        ...BINANCE,
        amountVesMinor: 999,
        frozenRate: 1,
        payerPhone: '04141234567',
        payerEmail: 'alguien@correo.com',
      },
      CONTEXT,
    );

    expect(draft.amountVesMinor).toBeNull();
    expect(draft.frozenRate).toBeNull();
    expect(draft.payerPhone).toBeNull();
    // El correo solo identifica a alguien en PayPal.
    expect(draft.payerEmail).toBeNull();
  });

  it('guarda el correo del pagador en PayPal y no la red', () => {
    const draft = buildPaymentReportDraft(
      {
        method: 'paypal',
        amountUsdMinor: 2800,
        txId: '9XY12345AB678901C',
        payerEmail: 'duena@salon.com',
        network: 'BEP20',
        proofUrl: 'https://cdn.clyps.app/comprobantes/1.png',
        note: 'pagué desde la cuenta de mi esposa',
      },
      CONTEXT,
    );

    expect(draft).toMatchObject({
      method: 'paypal',
      payerEmail: 'duena@salon.com',
      network: null,
      proofUrl: 'https://cdn.clyps.app/comprobantes/1.png',
      note: 'pagué desde la cuenta de mi esposa',
    });
  });

  it('rechaza el reporte sin referencia: no habría con qué conciliarlo', () => {
    expect(() =>
      buildPaymentReportDraft({ ...PAGO_MOVIL, reference: '   ' }, CONTEXT),
    ).toThrow(BadRequestException);
    expect(() =>
      buildPaymentReportDraft({ ...BINANCE, txId: undefined }, CONTEXT),
    ).toThrow(BadRequestException);
  });

  it('rechaza una fecha de cotización inválida', () => {
    expect(() =>
      buildPaymentReportDraft({ ...PAGO_MOVIL, quotedAt: 'ayer' }, CONTEXT),
    ).toThrow(BadRequestException);
  });
});
