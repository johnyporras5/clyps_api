import {
  parseSignatureHeader,
  signCobrixPayload,
  verifyCobrixSignature,
} from './cobrix-signature.util';

/**
 * La firma es lo único que separa un pago conciliado de alguien activándose la
 * suscripción con un curl. Estas pruebas son el candado de ese criterio.
 */

const SECRET = 'whsec_de_prueba';
const BODY = '{"id":"evt_1","event":"payment.succeeded"}';
const NOW = new Date('2026-09-03T12:00:00.000Z');
const TIMESTAMP = Math.floor(NOW.getTime() / 1000);

function verify(header: string | undefined, options = {}) {
  return verifyCobrixSignature(
    Buffer.from(BODY, 'utf8'),
    { signature: header },
    { secret: SECRET, toleranceSeconds: 300, now: NOW, ...options },
  );
}

describe('firma del webhook de Cobrix', () => {
  it('acepta la firma que calcula Cobrix sobre el cuerpo crudo', () => {
    const header = signCobrixPayload(BODY, SECRET, TIMESTAMP);

    expect(verify(header)).toEqual({ ok: true, timestamp: TIMESTAMP });
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const header = signCobrixPayload(BODY, 'otro_secreto', TIMESTAMP);

    expect(verify(header)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rechaza el cuerpo alterado aunque la firma sea de Cobrix', () => {
    const header = signCobrixPayload(BODY, SECRET, TIMESTAMP);
    const alterado = Buffer.from(BODY.replace('evt_1', 'evt_2'), 'utf8');

    const check = verifyCobrixSignature(
      alterado,
      { signature: header },
      { secret: SECRET, toleranceSeconds: 300, now: NOW },
    );

    expect(check).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rechaza una firma vieja: un webhook grabado no se puede reenviar', () => {
    const viejo = TIMESTAMP - 3600;
    const header = signCobrixPayload(BODY, SECRET, viejo);

    expect(verify(header)).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('rechaza cuando no viene el header', () => {
    expect(verify(undefined)).toEqual({ ok: false, reason: 'missing_header' });
  });

  it('rechaza un header sin la parte v1', () => {
    expect(verify(`t=${TIMESTAMP}`)).toEqual({
      ok: false,
      reason: 'malformed_header',
    });
  });

  it('sin secreto configurado no valida nada', () => {
    const header = signCobrixPayload(BODY, SECRET, TIMESTAMP);

    expect(verify(header, { secret: undefined })).toEqual({
      ok: false,
      reason: 'no_secret',
    });
  });

  it('toma el timestamp del header aparte si la firma no lo trae', () => {
    const digest = signCobrixPayload(BODY, SECRET, TIMESTAMP).split('v1=')[1];

    const check = verifyCobrixSignature(
      BODY,
      { signature: `v1=${digest}`, timestamp: String(TIMESTAMP) },
      { secret: SECRET, toleranceSeconds: 300, now: NOW },
    );

    expect(check).toEqual({ ok: true, timestamp: TIMESTAMP });
  });

  it('desarma el header de Cobrix', () => {
    expect(parseSignatureHeader('t=1736870400,v1=abcd')).toEqual({
      timestamp: 1736870400,
      signature: 'abcd',
    });
  });
});
