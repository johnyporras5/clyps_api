import {
  buildTrialExtendedEmail,
  buildVipGrantedEmail,
  formatLongDate,
} from './admin-billing-email.template';

const OPTS = {
  webUrl: 'https://sistemaclyps.com',
  assetsBaseUrl: 'https://cdn.example.com/assets/',
  supportWhatsapp: '+58 412-555-0000',
};

describe('formatLongDate', () => {
  it('en español y en la hora de Caracas, no en UTC', () => {
    // 26/11 00:30 UTC = 25/11 20:30 en Caracas (UTC-4).
    expect(formatLongDate(new Date('2026-11-26T00:30:00Z'))).toBe(
      'Miércoles, 25 de noviembre de 2026',
    );
    expect(formatLongDate(new Date('2026-11-26T15:00:00Z'))).toBe(
      'Jueves, 26 de noviembre de 2026',
    );
  });
});

describe('buildVipGrantedEmail', () => {
  const mail = buildVipGrantedEmail(
    { companyName: 'Salón Bella', since: new Date('2026-11-11T15:00:00Z') },
    OPTS,
  );

  it('asunto y contenido de bienvenida VIP', () => {
    expect(mail.subject).toBe('👑 Salón Bella, ahora eres VIP en CLYPS');
    expect(mail.html).toContain('Mientras seas VIP, no te cobramos nada');
    expect(mail.html).toContain('Miembro VIP desde el 11 de noviembre de 2026');
    expect(mail.html).toContain(
      'https://cdn.example.com/assets/email/clyps-logo.png',
    );
    expect(mail.html).toContain('https://wa.me/584125550000');
  });

  it('no promete que el VIP sea para siempre', () => {
    const text = mail.html.toLowerCase();
    for (const banned of [
      'para siempre',
      'no vence',
      'no caduca',
      'vencimiento',
      'gratis',
    ])
      expect(text).not.toContain(banned);
  });

  it('escapa el nombre del salón (lo escribe el dueño)', () => {
    const evil = buildVipGrantedEmail(
      {
        companyName:
          '<a href="https://phish.example">Paga aquí</a>\r\nBcc: x@y.z',
        since: new Date(),
      },
      OPTS,
    );
    expect(evil.html).not.toContain('<a href="https://phish.example">');
    expect(evil.html).toContain(
      '&lt;a href=&quot;https://phish.example&quot;&gt;',
    );
    expect(evil.subject).not.toMatch(/[\r\n]/);
  });

  it('sin https no pone logo, y sin WhatsApp válido no pone botón', () => {
    const plain = buildVipGrantedEmail(
      { companyName: 'X', since: new Date() },
      {
        ...OPTS,
        assetsBaseUrl: 'http://localhost:4000/assets',
        supportWhatsapp: '12',
      },
    );
    expect(plain.html).not.toContain('clyps-logo.png');
    expect(plain.html).not.toContain('wa.me');
  });
});

describe('buildTrialExtendedEmail', () => {
  const end = new Date('2026-11-26T15:00:00Z');

  it('+15: dice "15 días más" y la fecha nueva', () => {
    const mail = buildTrialExtendedEmail(
      { companyName: 'Salón Bella', trialEndsAt: end, opened: false },
      OPTS,
    );
    expect(mail.subject).toBe('🎁 Salón Bella, te regalamos 15 días más');
    expect(mail.html).toContain('15 días más de prueba');
    expect(mail.html).toContain('Jueves, 26 de noviembre de 2026');
  });

  it('prueba recién abierta: "te activamos", nunca "más"', () => {
    const mail = buildTrialExtendedEmail(
      { companyName: 'Salón Bella', trialEndsAt: end, opened: true },
      OPTS,
    );
    expect(mail.subject).toBe('🎁 Salón Bella, te activamos 15 días de prueba');
    expect(mail.subject).not.toContain('más');
    expect(mail.html).not.toContain('días más');
  });
});
