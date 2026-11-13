import {
  decodeEmailParam,
  signUnsubscribe,
  unsubscribeUrl,
  verifyUnsubscribe,
} from './unsubscribe-token.util';
import {
  buildLaunchEmail,
  buildTeaserEmail,
  type CampaignEmailInput,
} from './campaign-email.template';
import { campaignPhase, resolveScheduledAt } from './campaign-schedule.util';

const SECRET = 'secreto-de-prueba';

describe('enlace de baja firmado', () => {
  it('la firma vale para ese correo (sin importar mayúsculas)', () => {
    const t = signUnsubscribe('Dueno@Salon.com', SECRET);
    expect(verifyUnsubscribe('dueno@salon.com', t, SECRET)).toBe(true);
  });

  it('NO sirve para dar de baja a otro correo cambiando la URL', () => {
    const t = signUnsubscribe('yo@salon.com', SECRET);
    expect(verifyUnsubscribe('competencia@salon.com', t, SECRET)).toBe(false);
  });

  it('con otro secreto no vale, y una firma vacía tampoco', () => {
    const t = signUnsubscribe('yo@salon.com', SECRET);
    expect(verifyUnsubscribe('yo@salon.com', t, 'otro')).toBe(false);
    expect(verifyUnsubscribe('yo@salon.com', '', SECRET)).toBe(false);
  });

  it('la URL lleva el correo codificado y se lee de vuelta', () => {
    const url = new URL(
      unsubscribeUrl('https://api.x.com/', 'yo@salon.com', SECRET),
    );
    expect(url.pathname).toBe('/public/email/unsubscribe');
    expect(url.search).not.toContain('@');
    const email = decodeEmailParam(url.searchParams.get('e') ?? '');
    expect(email).toBe('yo@salon.com');
    expect(verifyUnsubscribe(email!, url.searchParams.get('t')!, SECRET)).toBe(
      true,
    );
  });

  it('basura en `e` no revienta', () => {
    expect(decodeEmailParam('%%%')).toBeNull();
    expect(decodeEmailParam(undefined)).toBeNull();
    expect(
      decodeEmailParam(Buffer.from('no-es-correo').toString('base64url')),
    ).toBeNull();
  });
});

describe('correos de campaña', () => {
  const input: CampaignEmailInput = {
    companyName: 'Salón Bella',
    payUrl: 'https://sistemaclyps.com/pay',
    unsubscribeUrl: 'https://api.x.com/public/email/unsubscribe?e=a&t=b',
    assetsBaseUrl: 'https://cdn.x.com/assets',
    windowStart: new Date('2026-11-23T04:00:00Z'),
    windowEnd: new Date('2026-12-05T04:00:00Z'),
  };

  it('intriga: anuncia el día que abre, sin precios y con la baja', () => {
    const mail = buildTeaserEmail(input);
    expect(mail.subject).toContain('Salón Bella');
    expect(mail.html).toContain('Este lunes 23 de noviembre');
    expect(mail.html).toContain('llega este lunes 23.');
    expect(mail.html).not.toMatch(/\$\d/);
    expect(mail.html).toContain('No quiero recibir promociones');
  });

  it('intriga: si la promo se mueve, el día del correo se mueve con ella', () => {
    const mail = buildTeaserEmail({
      ...input,
      windowStart: new Date('2026-11-27T04:00:00Z'),
    });
    expect(mail.html).toContain('Este viernes 27 de noviembre');
  });

  it('promo: precios, último día INCLUIDO (4 de diciembre) y la baja', () => {
    const mail = buildLaunchEmail(input);
    expect(mail.html).toContain('$30');
    expect(mail.html).toContain('$60');
    expect(mail.html).toContain('Ahorras $15');
    expect(mail.html).toContain('4 de diciembre');
    expect(mail.html).toContain('https://sistemaclyps.com/pay');
    expect(mail.html).toContain('No quiero recibir promociones');
  });

  it('el nombre del salón va escapado, y sin saltos en el asunto', () => {
    const mail = buildLaunchEmail({
      ...input,
      companyName: '<a href="https://phish.example">X</a>\r\nBcc: a@b.c',
    });
    expect(mail.html).not.toContain('<a href="https://phish.example">');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe('cuándo salen solas', () => {
  const window = {
    start: new Date('2026-11-23T04:00:00Z'),
    end: new Date('2026-12-05T04:00:00Z'),
  };
  const teaser = resolveScheduledAt('bf2026_teaser', undefined);
  const launch = resolveScheduledAt('bf2026_launch', undefined);
  const at = (iso: string) => new Date(iso);
  const phase = (c: 'bf2026_teaser' | 'bf2026_launch', iso: string) =>
    campaignPhase(c, c === 'bf2026_teaser' ? teaser : launch, window, at(iso));

  it('por defecto: intriga viernes 20 a las 10 a. m. y promo lunes 23 a las 8 a. m. (Caracas)', () => {
    expect(teaser.toISOString()).toBe('2026-11-20T14:00:00.000Z');
    expect(launch.toISOString()).toBe('2026-11-23T12:00:00.000Z');
  });

  it('la intriga sale ANTES de que abra la promo (si no, se saltaría)', () => {
    expect(teaser.getTime()).toBeLessThan(window.start.getTime());
  });

  it('una fecha mal escrita en el .env no adelanta el envío', () => {
    expect(resolveScheduledAt('bf2026_teaser', 'mañana')).toEqual(teaser);
  });

  it('intriga: antes de su hora no, después sí, y con la promo abierta ya no', () => {
    expect(phase('bf2026_teaser', '2026-11-20T13:59:00Z')).toBe('scheduled');
    expect(phase('bf2026_teaser', '2026-11-20T14:05:00Z')).toBe('due');
    expect(phase('bf2026_teaser', '2026-11-23T05:00:00Z')).toBe('closed');
  });

  it('promo: sale a su hora y deja de salir cuando la promo cierra', () => {
    expect(phase('bf2026_launch', '2026-11-23T11:00:00Z')).toBe('scheduled');
    expect(phase('bf2026_launch', '2026-11-23T12:10:00Z')).toBe('due');
    expect(phase('bf2026_launch', '2026-12-05T05:00:00Z')).toBe('closed');
  });
});
