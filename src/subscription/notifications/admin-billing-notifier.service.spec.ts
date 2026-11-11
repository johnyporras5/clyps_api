import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { EmailService } from '../../email/email.service';
import { AdminBillingNotifierService } from './admin-billing-notifier.service';

function build(rows: unknown[] | Error, sendResult: boolean | Error = true) {
  const query =
    rows instanceof Error
      ? jest.fn().mockRejectedValue(rows)
      : jest.fn().mockResolvedValue(rows);
  const sendEmail =
    sendResult instanceof Error
      ? jest.fn().mockRejectedValue(sendResult)
      : jest.fn().mockResolvedValue(sendResult);
  const service = new AdminBillingNotifierService(
    { query } as unknown as DataSource,
    { sendEmail } as unknown as EmailService,
    { get: jest.fn(() => undefined) } as unknown as ConfigService,
  );
  return { service, query, sendEmail };
}

describe('AdminBillingNotifierService', () => {
  it('manda el VIP al correo del usuario dueño', async () => {
    const t = build([
      {
        companyName: 'Bella',
        ownerEmail: 'dueno@x.com',
        companyEmail: 'salon@x.com',
      },
    ]);
    await t.service.vipGranted(12, new Date());

    expect(t.query).toHaveBeenCalledWith(expect.any(String), [12]);
    expect(t.sendEmail).toHaveBeenCalledWith(
      'dueno@x.com',
      '👑 Bella, ahora eres VIP en CLYPS',
      expect.any(String),
    );
  });

  it('sin correo del dueño usa el del negocio', async () => {
    const t = build([
      { companyName: 'Bella', ownerEmail: '  ', companyEmail: 'salon@x.com' },
    ]);
    await t.service.trialExtended(12, new Date(), false);
    expect(t.sendEmail).toHaveBeenCalledWith(
      'salon@x.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('sin ningún correo, o sin salón, no envía', async () => {
    const a = build([
      { companyName: 'Bella', ownerEmail: null, companyEmail: null },
    ]);
    await a.service.vipGranted(12, new Date());
    expect(a.sendEmail).not.toHaveBeenCalled();

    const b = build([]);
    await b.service.vipGranted(12, new Date());
    expect(b.sendEmail).not.toHaveBeenCalled();
  });

  it('nunca lanza: ni si falla la consulta ni si falla el envío', async () => {
    await expect(
      build(new Error('db caída')).service.vipGranted(12, new Date()),
    ).resolves.toBeUndefined();
    await expect(
      build(
        [{ companyName: 'B', ownerEmail: 'a@b.c', companyEmail: null }],
        new Error('resend caído'),
      ).service.trialExtended(12, new Date(), true),
    ).resolves.toBeUndefined();
  });
});
