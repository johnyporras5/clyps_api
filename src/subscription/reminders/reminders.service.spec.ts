import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { RemindersService } from './reminders.service';
import type { ReminderChannelAdapter } from './reminder-delivery';
import type { Company } from '../../company/entities/company.entity';
import type { PaymentReport } from '../entities/payment-report.entity';
import type { ReminderLog } from '../entities/reminder-log.entity';
import type { Subscription } from '../entities/subscription.entity';
import type { ExchangeRateService } from '../rate/exchange-rate.service';

/**
 * Las pruebas que pide SUB-8: el escalado llega al canal, un reporte pendiente
 * lo pausa y el mismo aviso no sale dos veces.
 */

const NOW = new Date('2026-09-01T09:00:00.000Z');

function inDays(n: number): Date {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
}

function buildService(
  options: {
    currentPeriodEnd?: Date | null;
    pendingReports?: number;
    verifiedCovering?: number;
    alreadySent?: boolean;
    channelFails?: boolean;
  } = {},
) {
  const subscription = {
    id: 1,
    companyId: 7,
    planId: 'basico',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd:
      options.currentPeriodEnd === undefined
        ? inDays(3)
        : options.currentPeriodEnd,
    graceEndsAt: null,
    billingExempt: false,
  } as Subscription;

  const subscriptions = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(subscription ? [subscription] : []),
    })),
  };

  const reports = {
    countBy: jest.fn().mockResolvedValue(options.pendingReports ?? 0),
    count: jest.fn().mockResolvedValue(options.verifiedCovering ?? 0),
  };

  const logs = {
    findOne: jest
      .fn()
      .mockResolvedValue(options.alreadySent ? { id: 1 } : null),
    create: jest.fn((draft: Partial<ReminderLog>) => draft),
    save: jest.fn((rows: unknown) => Promise.resolve(rows)),
  };

  const companies = {
    find: jest
      .fn()
      .mockResolvedValue([
        { id: 7, name: 'Urban Style', email: 'salon@yopmail.com', userId: 42 },
      ]),
  };

  const rates = { fetchRate: jest.fn().mockResolvedValue({ rate: 794.9917 }) };

  const channel = {
    channel: 'in_app' as const,
    isEnabled: () => true,
    deliver: jest.fn().mockResolvedValue(!options.channelFails),
  };

  const apagado = {
    channel: 'email' as const,
    isEnabled: () => false,
    deliver: jest.fn().mockResolvedValue(true),
  };

  const service = new RemindersService(
    subscriptions as unknown as Repository<Subscription>,
    reports as unknown as Repository<PaymentReport>,
    logs as unknown as Repository<ReminderLog>,
    companies as unknown as Repository<Company>,
    rates as unknown as ExchangeRateService,
    { get: () => undefined } as unknown as ConfigService,
    [channel, apagado] as unknown as ReminderChannelAdapter[],
  );

  return { service, channel, apagado, logs, reports };
}

describe('el barrido de recordatorios', () => {
  it('avisa y deja constancia del tier y el vencimiento', async () => {
    const { service, channel, logs } = buildService();

    expect(await service.sweep(NOW)).toBe(1);

    const [recipient, message] = channel.deliver.mock.calls[0] as [
      { companyId: number; userId: number },
      { tier: string; title: string; body: string },
    ];
    expect(recipient).toMatchObject({ companyId: 7, userId: 42 });
    expect(message.tier).toBe('d-3');
    // Accionable de un toque: el monto en Bs viaja en el cuerpo.
    expect(message.body).toContain('11.924,88');

    expect(logs.save).toHaveBeenCalledTimes(1);
    expect(logs.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 7, tier: 'd-3', channel: 'in_app' }),
    );
  });

  it('no usa los canales apagados', async () => {
    const { service, apagado } = buildService();
    await service.sweep(NOW);
    expect(apagado.deliver).not.toHaveBeenCalled();
  });

  it('un reporte pendiente pausa el aviso', async () => {
    const { service, channel } = buildService({ pendingReports: 1 });

    expect(await service.sweep(NOW)).toBe(0);
    expect(channel.deliver).not.toHaveBeenCalled();
  });

  it('un pago verificado que cubre el próximo período también lo pausa', async () => {
    const { service, channel } = buildService({ verifiedCovering: 1 });

    expect(await service.sweep(NOW)).toBe(0);
    expect(channel.deliver).not.toHaveBeenCalled();
  });

  it('no reenvía el mismo tier para el mismo vencimiento', async () => {
    const { service, channel } = buildService({ alreadySent: true });

    expect(await service.sweep(NOW)).toBe(0);
    expect(channel.deliver).not.toHaveBeenCalled();
  });

  it('si no se entregó, no se escribe bitácora: mañana se reintenta', async () => {
    const { service, logs } = buildService({ channelFails: true });

    expect(await service.sweep(NOW)).toBe(0);
    expect(logs.save).not.toHaveBeenCalled();
  });

  it('los días sin offset no generan nada', async () => {
    const { service, channel } = buildService({ currentPeriodEnd: inDays(5) });

    expect(await service.sweep(NOW)).toBe(0);
    expect(channel.deliver).not.toHaveBeenCalled();
  });

  it('vencido y sin gracia: avisa el bloqueo', async () => {
    const { service, channel } = buildService({ currentPeriodEnd: inDays(-9) });

    expect(await service.sweep(NOW)).toBe(1);
    const [, message] = channel.deliver.mock.calls[0] as [
      unknown,
      { tier: string },
    ];
    expect(message.tier).toBe('blocked');
  });
});
