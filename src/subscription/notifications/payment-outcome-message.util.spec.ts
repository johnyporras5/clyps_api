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

describe('pago rechazado', () => {
  const message = buildPaymentRejectedMessage({
    companyName: 'Salón Bella',
    reason: 'No aparece el pago en la cuenta',
    reference: '0XREFERENCIA01',
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

  it('repite los datos de pago: corregir no debe mandarlo a otra pantalla', () => {
    expect(message.body).toContain('0414-1234567');
    expect(message.body).toContain('Banesco');
  });

  it('aclara que no perdió el acceso que tenía', () => {
    expect(message.body).toContain('Tu acceso no cambió');
  });

  it('escapa el motivo en el HTML: lo escribe una persona', () => {
    const hostile = buildPaymentRejectedMessage({
      companyName: 'Salón Bella',
      reason: '<script>alert(1)</script>',
      reference: null,
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
      instructions,
    });

    expect(sinReferencia.body).toContain('No pudimos confirmar tu pago');
    // La frase con la referencia concreta no aparece; la instrucción genérica
    // de "el monto y la referencia deben coincidir" sí, y debe seguir ahí.
    expect(sinReferencia.body).not.toContain('con referencia');
  });
});
