import {
  buildPaymentRejectedMessage,
  buildPaymentVerifiedMessage,
} from './payment-outcome-message.util';
import type { PaymentInstructions } from '../reminders/reminder-message.util';

/**
 * Los dos mensajes de SUB-9. Lo que se prueba es lo que el ticket promete: el
 * verificado dice HASTA CUÁNDO, y el rechazado dice POR QUÉ y CÓMO corregirlo.
 */

const instructions: PaymentInstructions = {
  phone: '0414-1234567',
  bank: 'Banesco',
  identification: 'V-12345678',
  holder: 'Clyps C.A.',
  link: 'https://app.clyps.co/suscripcion',
};

describe('pago verificado', () => {
  const message = buildPaymentVerifiedMessage({
    companyName: 'Salón Bella',
    planName: 'Full',
    accessEndsAt: new Date('2026-10-19T14:56:08.000Z'),
    link: instructions.link,
  });

  it('dice hasta cuándo queda activo el plan', () => {
    expect(message.title).toBe('Plan Full activado hasta el 19/10/2026');
    expect(message.body).toContain('activo hasta el 19/10/2026');
    expect(message.body).toContain('Salón Bella');
  });

  it('no le pide nada al dueño: el asunto está cerrado', () => {
    expect(message.body).toContain('No tienes que hacer nada más');
    expect(message.body).not.toContain('reporta');
  });

  it('lleva la versión HTML para el canal de correo', () => {
    expect(message.html).toContain('<p>');
    expect(message.html).toContain('19/10/2026');
    expect(message.actionUrl).toBe('https://app.clyps.co/suscripcion');
  });
});

/** Sigue operando, con su período todavía vigente. */
const accesoVigente = {
  canOperate: true,
  // Construidas en hora LOCAL a propósito: `formatDate` formatea en local, y
  // una fecha en UTC a medianoche cae el día anterior en Venezuela.
  accessEndsAt: new Date(2026, 9, 19),
  graceEndsAt: null,
};

describe('pago rechazado', () => {
  const message = buildPaymentRejectedMessage({
    companyName: 'Salón Bella',
    reason: 'No aparece el pago en la cuenta',
    reference: '0XREFERENCIA01',
    access: accesoVigente,
    instructions,
  });

  it('dice el motivo tal como lo escribió quien revisó', () => {
    expect(message.body).toContain('Motivo: No aparece el pago en la cuenta');
  });

  it('identifica CUÁL pago fue y explica cómo reintentarlo', () => {
    expect(message.body).toContain('0XREFERENCIA01');
    expect(message.body).toContain('repórtalo de nuevo');
    expect(message.actionUrl).toBe('https://app.clyps.co/suscripcion');
  });

  /**
   * Los datos siguen ahí —corregir un pago no debería mandarlo a otra
   * pantalla—, pero APARTE del cuerpo: dentro de la app del teléfono no se
   * pueden mostrar cuentas, y el cuerpo es lo único que se pinta ahí.
   */
  it('repite los datos de pago, pero fuera del cuerpo', () => {
    const datos = message.paymentLines.join(' ');
    expect(datos).toContain('0414-1234567');
    expect(datos).toContain('Banesco');

    expect(message.body).not.toContain('0414-1234567');
    expect(message.body).not.toContain('Banesco');
  });

  it('el correo sí los lleva dentro del texto: se lee fuera de la app', () => {
    expect(message.html).toContain('0414-1234567');
  });

  it('con el período vigente, dice hasta cuándo le llega el acceso', () => {
    expect(message.body).toContain(
      'Tu acceso sigue vigente hasta el 19/10/2026',
    );
    expect(message.title).toBe('No pudimos confirmar tu pago');
  });

  it('BLOQUEADO: lo dice en el título y explica por qué se acabó la cortesía', () => {
    // El caso que importa: mientras el reporte estaba en revisión seguía
    // operando aunque su gracia ya hubiera vencido. Al rechazarlo, se cae.
    const bloqueado = buildPaymentRejectedMessage({
      companyName: 'Salón Bella',
      reason: 'El comprobante no corresponde',
      reference: '004512',
      access: { canOperate: false, accessEndsAt: null, graceEndsAt: null },
      instructions,
    });

    expect(bloqueado.title).toBe(
      'No pudimos confirmar tu pago: tu acceso quedó bloqueado',
    );
    expect(bloqueado.body).toContain('Tu acceso quedó BLOQUEADO');
    expect(bloqueado.body).toContain('reactivarlo');
    expect(bloqueado.body).not.toContain('sigue vigente');
  });

  it('en gracia: dice hasta cuándo le queda cortesía y qué pasa después', () => {
    const enGracia = buildPaymentRejectedMessage({
      companyName: 'Salón Bella',
      reason: 'El monto no coincide',
      reference: '004512',
      access: {
        canOperate: true,
        accessEndsAt: new Date(2026, 8, 1),
        graceEndsAt: new Date(2026, 8, 6),
      },
      instructions,
    });

    expect(enGracia.body).toContain('cortesía hasta el 06/09/2026');
    expect(enGracia.body).toContain('el acceso se bloquea');
  });

  it('escapa el motivo en el HTML: lo escribe una persona', () => {
    const hostile = buildPaymentRejectedMessage({
      companyName: 'Salón Bella',
      reason: '<script>alert(1)</script>',
      reference: null,
      access: accesoVigente,
      instructions,
    });

    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain('&lt;script&gt;');
  });

  it('sin referencia, no inventa una', () => {
    const sinReferencia = buildPaymentRejectedMessage({
      companyName: 'Salón Bella',
      reason: 'El monto no coincide',
      reference: null,
      access: accesoVigente,
      instructions,
    });

    expect(sinReferencia.body).toContain('No pudimos confirmar tu pago');
    // La frase con la referencia concreta no aparece; la instrucción genérica
    // de "el monto y la referencia deben coincidir" sí, y debe seguir ahí.
    expect(sinReferencia.body).not.toContain('con referencia');
  });
});
