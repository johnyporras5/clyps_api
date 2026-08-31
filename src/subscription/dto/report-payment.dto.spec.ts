// Los decoradores del DTO leen metadata: fuera de Nest hay que cargarla a mano.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReportPaymentDto } from './report-payment.dto';

/** Campos con error, tal como los devolvería el ValidationPipe global. */
function invalidFields(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(ReportPaymentDto, body, {
    enableImplicitConversion: true,
  });
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })
    .map((error) => error.property)
    .sort();
}

const PAGO_MOVIL = {
  method: 'pago_movil',
  amountVesMinor: 2225977,
  frozenRate: 794.9917,
  quotedAt: '2026-08-31T15:40:52.291Z',
  reference: '004512',
  payerPhone: '04141234567',
  payerBankCode: '0102',
};

const BINANCE = {
  method: 'binance',
  amountUsdMinor: 2800,
  txId: '0xabc123def456',
};

describe('ReportPaymentDto', () => {
  it('acepta un Pago Móvil completo', () => {
    expect(invalidFields(PAGO_MOVIL)).toEqual([]);
  });

  it('exige el monto congelado y los datos del pagador en Pago Móvil', () => {
    expect(invalidFields({ method: 'pago_movil' })).toEqual([
      'amountVesMinor',
      'frozenRate',
      'payerBankCode',
      'payerPhone',
      'quotedAt',
      'reference',
    ]);
  });

  it('no le pide a Pago Móvil los campos de los métodos en dólares', () => {
    const errores = invalidFields({ method: 'pago_movil' });
    expect(errores).not.toContain('amountUsdMinor');
    expect(errores).not.toContain('txId');
  });

  it('acepta Binance y PayPal con monto en USD y txId', () => {
    expect(invalidFields(BINANCE)).toEqual([]);
    expect(
      invalidFields({
        method: 'paypal',
        amountUsdMinor: 2800,
        txId: '9XY12345AB678901C',
        payerEmail: 'duena@salon.com',
      }),
    ).toEqual([]);
  });

  it('exige monto en USD y txId en Binance/PayPal, no el monto en Bs', () => {
    expect(invalidFields({ method: 'binance' })).toEqual([
      'amountUsdMinor',
      'txId',
    ]);
    expect(invalidFields({ method: 'paypal' })).toEqual([
      'amountUsdMinor',
      'txId',
    ]);
  });

  it('rechaza un método que no existe', () => {
    expect(invalidFields({ method: 'zelle' })).toContain('method');
  });

  it('rechaza montos que no son enteros positivos', () => {
    // El dinero va en unidades mínimas: 28.5 centavos no existe.
    expect(invalidFields({ ...BINANCE, amountUsdMinor: 28.5 })).toContain(
      'amountUsdMinor',
    );
    expect(invalidFields({ ...PAGO_MOVIL, amountVesMinor: -100 })).toContain(
      'amountVesMinor',
    );
  });

  it('rechaza una tasa no positiva y una fecha de cotización que no es fecha', () => {
    expect(invalidFields({ ...PAGO_MOVIL, frozenRate: 0 })).toContain(
      'frozenRate',
    );
    expect(invalidFields({ ...PAGO_MOVIL, quotedAt: 'ayer' })).toContain(
      'quotedAt',
    );
  });

  it('valida el formato de los campos opcionales cuando vienen', () => {
    expect(invalidFields({ ...BINANCE, proofUrl: 'no-es-url' })).toContain(
      'proofUrl',
    );
    expect(
      invalidFields({
        method: 'paypal',
        amountUsdMinor: 2800,
        txId: '9XY12345AB678901C',
        payerEmail: 'arroba-menos',
      }),
    ).toContain('payerEmail');
  });

  it('rechaza propiedades que no existen en el contrato', () => {
    expect(invalidFields({ ...BINANCE, montoTotal: 28 })).toContain(
      'montoTotal',
    );
  });
});
