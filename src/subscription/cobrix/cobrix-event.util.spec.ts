import {
  eventIdOf,
  eventNameOf,
  findProviderReference,
  parseCobrixInvoiceEvent,
} from './cobrix-event.util';

/**
 * Se prueba contra las formas REALES de los dos canales, no contra un JSON
 * inventado: lo que interesa es que sepamos leer lo que Cobrix manda de verdad,
 * y que un campo que se mueva no descarte un cobro en silencio.
 */

/** Canal de documentos. Medido en producción: `event` es un OBJETO. */
function invoicePaid() {
  return {
    event: {
      type: 'invoice.paid',
      timestamp: '2026-09-01T10:00:00.000Z',
      company_id: 'cmp_1',
      environment: 'sandbox',
    },
    invoice: {
      id: 'inv_d64d7b11',
      amount: 22259.77,
      status: 'paid',
      provider: 'clyps',
      reference: 'J401234567',
      provider_id: 'clyps-7-1788372343',
      payment: {
        id: 'pay_842f7712',
        amount: 22259.77,
        currency: 'VES',
        status: 'succeeded',
        paid_at: '2026-09-01T10:00:00.000Z',
      },
    },
  };
}

describe('evento del canal de documentos', () => {
  it('lee un cobro confirmado', () => {
    const event = parseCobrixInvoiceEvent(invoicePaid());

    expect(event?.eventType).toBe('invoice.paid');
    expect(event?.providerReference).toBe('clyps-7-1788372343');
    expect(event?.invoiceId).toBe('inv_d64d7b11');
    expect(event?.paymentId).toBe('pay_842f7712');
    expect(event?.amount).toBe(22259.77);
    expect(event?.currency).toBe('VES');
  });

  it('compone una llave de idempotencia estable: este canal no trae id', () => {
    const primera = parseCobrixInvoiceEvent(invoicePaid());
    const reentrega = parseCobrixInvoiceEvent(invoicePaid());

    expect(primera?.eventId).toBe('invoice.paid:inv_d64d7b11:pay_842f7712');
    // La reentrega del mismo pago tiene que dar la MISMA llave, o el candado
    // único no sirve de nada.
    expect(reentrega?.eventId).toBe(primera?.eventId);
  });

  it('no confunde `event` objeto con `event` string', () => {
    // Leer `event` como string es el error que descarta todos los cobros.
    expect(eventNameOf({ event: { type: 'invoice.paid' } })).toBe(
      'invoice.paid',
    );
    expect(eventNameOf({ event: 'checkout.session.completed' })).toBe(
      'checkout.session.completed',
    );
  });

  it('descarta un cuerpo sin nombre de evento', () => {
    expect(parseCobrixInvoiceEvent({ invoice: { id: 'inv_1' } })).toBeNull();
    expect(parseCobrixInvoiceEvent(null)).toBeNull();
  });

  it('no revienta con un payload al que le faltan campos', () => {
    const event = parseCobrixInvoiceEvent({ event: { type: 'invoice.paid' } });

    expect(event?.providerReference).toBeNull();
    expect(event?.amount).toBeNull();
    expect(event?.invoiceId).toBeNull();
  });
});

describe('referencia en el canal general', () => {
  it('la encuentra incrustada dentro de otro identificador', () => {
    // Forma medida: `data.documents[0].invoiceNumber = "clyps:clyps-7-…"`.
    const found = findProviderReference(
      {
        id: 'evt_1',
        event: 'checkout.session.completed',
        data: { documents: [{ invoiceNumber: 'clyps:clyps-7-1788372343' }] },
      },
      'clyps',
    );

    expect(found).toBe('clyps-7-1788372343');
  });

  it('la encuentra esté donde esté, sin depender de la estructura', () => {
    expect(
      findProviderReference(
        { a: { b: [{ c: 'clyps-99-1700000000' }] } },
        'clyps',
      ),
    ).toBe('clyps-99-1700000000');
  });

  it('devuelve null cuando el evento no es nuestro', () => {
    expect(
      findProviderReference({ data: { ref: 'otra-cosa-123' } }, 'clyps'),
    ).toBeNull();
  });

  it('lee el id de evento del envelope general', () => {
    expect(eventIdOf({ id: 'evt_general_1' })).toBe('evt_general_1');
    expect(eventIdOf({})).toBeNull();
  });
});
