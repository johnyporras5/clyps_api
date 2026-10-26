import { OnboardingRescueService } from './onboarding-rescue.service';
import { buildOwnerRescueEmail } from './owner-rescue-email.template';
import { buildRescueDigestHtml } from './rescue-digest.template';
import type { StuckTenant } from '../types/rescue.types';

const tenant = (over: Partial<StuckTenant> = {}): StuckTenant => ({
  companyId: 1,
  companyName: 'Barbería El Estilo',
  phone: null,
  ownerEmail: 'dueno@example.com',
  ownerUserId: 10,
  step: 'configure_payroll',
  daysStalled: 4,
  completedSteps: 3,
  level: 'alert',
  lastProgressAt: new Date(),
  startedAt: new Date(),
  ...over,
});

const opts = {
  webUrl: 'https://sistemaclyps.com',
  assetsBaseUrl: 'https://cdn.example.com/',
  supportWhatsapp: '+58 414-123-4567',
};

describe('buildOwnerRescueEmail', () => {
  it('reminder no lleva correo (es la notificación in-app)', () => {
    expect(
      buildOwnerRescueEmail(tenant({ level: 'reminder' }), opts),
    ).toBeNull();
  });

  it('alert agradece, muestra el progreso de 6 pasos y lleva a la web', () => {
    const mail = buildOwnerRescueEmail(tenant(), opts)!;
    expect(mail.subject).toContain(
      '¡Gracias por elegirnos, Barbería El Estilo!',
    );
    expect(mail.html).toContain('3 de 6');
    expect(mail.html).toContain('href="https://sistemaclyps.com"');
    expect(mail.html).toContain(
      'src="https://cdn.example.com/email/clyps-logo.png"',
    );
    expect(mail.html).toContain('https://wa.me/584141234567?text=');
  });

  it('risk ofrece hacerlo juntos', () => {
    const mail = buildOwnerRescueEmail(tenant({ level: 'risk' }), opts)!;
    expect(mail.subject).toBe('Barbería El Estilo, ¿te echamos una mano? 🤝');
    expect(mail.html).toContain('¿Lo hacemos juntos?');
  });

  it('sin número de WhatsApp no deja botones rotos', () => {
    for (const level of ['alert', 'risk'] as const) {
      const mail = buildOwnerRescueEmail(tenant({ level }), {
        ...opts,
        supportWhatsapp: null,
      })!;
      expect(mail.html).not.toContain('wa.me');
      expect(mail.html).toContain('href="https://sistemaclyps.com"');
    }
  });

  it('escapa el nombre del negocio en el HTML', () => {
    const mail = buildOwnerRescueEmail(
      tenant({ companyName: '<script>x</script> & Co' }),
      opts,
    )!;
    expect(mail.html).not.toContain('<script>x');
    expect(mail.html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; Co');
  });
});

describe('buildRescueDigestHtml', () => {
  it('cuenta sobre los 6 pasos, no sobre 5', () => {
    const html = buildRescueDigestHtml([tenant()], {
      reminder: 2,
      alert: 4,
      risk: 7,
    });
    expect(html).toContain('3 de 6 completos');
  });
});

describe('OnboardingRescueService.runSweep', () => {
  /** Arma el servicio con la tabla anti-spam simulada en memoria. */
  function setup(stuck: StuckTenant[], sendOk: (to: string) => boolean) {
    const claimed = new Set<string>();
    const key = (p: unknown[]) => p.slice(0, 4).join('|');
    const rescueRepo = {
      query: jest.fn((_sql: string, params: unknown[]) => {
        const [companyId, step, level, channel] = params;
        const k = key([companyId, step, level, channel]);
        if (claimed.has(k)) return { affectedRows: 0 };
        claimed.add(k);
        return { affectedRows: 1 };
      }),
      delete: jest.fn((w: Record<string, unknown>) => {
        claimed.delete(key([w.companyId, w.step, w.level, w.channel]));
      }),
    };
    const email = { sendEmail: jest.fn((to: string) => sendOk(to)) };
    const notifications = { createNotification: jest.fn() };
    const config = {
      get: jest.fn((k: string) =>
        k === 'ONBOARDING_CONSULTANT_EMAIL'
          ? 'consultor@example.com'
          : undefined,
      ),
    };
    const service = new OnboardingRescueService(
      {} as never,
      rescueRepo as never,
      config as never,
      email as never,
      notifications as never,
    );
    jest.spyOn(service, 'findStuckTenants').mockResolvedValue(stuck);
    return { service, email, claimed };
  }

  it('desde alert manda correo al dueño y digest, y no los repite', async () => {
    const { service, email } = setup([tenant()], () => true);

    const first = await service.runSweep();
    expect(first.ownerEmails).toBe(1);
    expect(first.digestSent).toBe(true);
    expect(email.sendEmail.mock.calls.map((c) => c[0])).toEqual([
      'dueno@example.com',
      'consultor@example.com',
    ]);

    const second = await service.runSweep();
    expect(second.ownerEmails).toBe(0);
    expect(second.skippedAlreadyNotified).toBe(2);
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('si falla el digest, el correo del dueño no se repite al día siguiente', async () => {
    const { service, claimed } = setup(
      [tenant()],
      (to) => to !== 'consultor@example.com',
    );
    await service.runSweep();
    expect([...claimed]).toEqual(['1|configure_payroll|alert|owner_email']);
  });

  it('si falla el correo del dueño, se suelta para reintentar', async () => {
    const { service, claimed } = setup(
      [tenant()],
      (to) => to !== 'dueno@example.com',
    );
    const result = await service.runSweep();
    expect(result.ownerEmails).toBe(0);
    expect([...claimed]).toEqual([
      '1|configure_payroll|alert|consultant_digest',
    ]);
  });

  it('dueño sin correo: no se reclama y el digest sale igual', async () => {
    const { service, email, claimed } = setup(
      [tenant({ ownerEmail: null })],
      () => true,
    );
    const result = await service.runSweep();
    expect(result.ownerEmails).toBe(0);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect([...claimed]).toEqual([
      '1|configure_payroll|alert|consultant_digest',
    ]);
  });
});
