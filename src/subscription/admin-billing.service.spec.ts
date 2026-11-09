import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { AdminBillingService } from './admin-billing.service';
import type { Subscription } from './entities/subscription.entity';
import type { Company } from '../company/entities/company.entity';
import type { SubscriptionService } from './subscription.service';
import type { EntitlementsService } from './entitlements.service';
import type { CobrixInvoiceService } from './cobrix/cobrix-invoice.service';

/**
 * Lo que importa: que cada botón sea idempotente (dos clics no regalan 30 días
 * ni anulan cobros dos veces), que +15 días respete sus reglas, que quitar el
 * VIP no deje al salón bloqueado en el acto, y que siempre se invalide la
 * caché de acceso.
 */

const DAY = 24 * 60 * 60 * 1000;

function build(options: {
  sub?: Partial<Subscription> | null;
  companyExists?: boolean;
  cobrixFails?: boolean;
}) {
  const row: Subscription | null =
    options.sub === null
      ? null
      : ({
          id: 1,
          companyId: 12,
          planId: null,
          status: 'blocked',
          trialEndsAt: new Date(Date.now() - 3 * DAY),
          currentPeriodEnd: null,
          graceEndsAt: null,
          billingExempt: false,
          ...options.sub,
        } as Subscription);

  const saved: Subscription[] = [];
  const manager = {
    findOne: jest.fn(() => Promise.resolve(row)),
    save: jest.fn((_e: unknown, s: Subscription) => {
      saved.push({ ...s });
      return Promise.resolve(s);
    }),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
  } as unknown as DataSource;

  const companies = {
    exists: jest.fn().mockResolvedValue(options.companyExists ?? true),
  } as unknown as Repository<Company>;
  const subscriptions = {
    findOne: jest.fn(() => Promise.resolve(row)),
    exists: jest.fn(() => Promise.resolve(row !== null)),
  } as unknown as Repository<Subscription>;
  const ensureSubscription = jest.fn().mockResolvedValue(row);
  const subscriptionService = {
    ensureSubscription,
  } as unknown as SubscriptionService;
  const invalidate = jest.fn();
  const entitlements = {
    invalidate,
    getAccessResponse: jest.fn().mockResolvedValue({ status: 'active' }),
  } as unknown as EntitlementsService;
  const releaseAllForCompany = options.cobrixFails
    ? jest.fn().mockRejectedValue(new Error('timeout'))
    : jest.fn().mockResolvedValue({
        released: ['INV-1'],
        unconfirmed: [],
        skippedWithPayment: ['INV-2'],
      });
  const cobrix = { releaseAllForCompany } as unknown as CobrixInvoiceService;

  const service = new AdminBillingService(
    dataSource,
    companies,
    subscriptions,
    subscriptionService,
    entitlements,
    cobrix,
  );
  return {
    service,
    saved,
    manager,
    invalidate,
    releaseAllForCompany,
    ensureSubscription,
    row,
  };
}

describe('AdminBillingService.grantVip', () => {
  it('marca VIP, deja el estado en active y anula los cobros abiertos', async () => {
    const t = build({});
    const res = await t.service.grantVip(12, 528);

    expect(res.changed).toBe(true);
    expect(t.saved[0]).toMatchObject({ billingExempt: true, status: 'active' });
    expect(t.releaseAllForCompany).toHaveBeenCalledWith(12, expect.any(String));
    expect(res.invoicesToReview).toEqual(['INV-2']);
    expect(t.invalidate).toHaveBeenCalledWith(12);
    // Los bloqueos son lo que evita la carrera de dos clics.
    expect(t.manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('si ya era VIP no guarda nada ni vuelve a tocar Cobrix', async () => {
    const t = build({ sub: { billingExempt: true } });
    const res = await t.service.grantVip(12, 528);

    expect(res.changed).toBe(false);
    expect(t.saved).toHaveLength(0);
    expect(t.releaseAllForCompany).not.toHaveBeenCalled();
  });

  it('si Cobrix falla, queda VIP igual y pide revisar a mano', async () => {
    const t = build({ cobrixFails: true });
    const res = await t.service.grantVip(12, 528);

    expect(res.changed).toBe(true);
    expect(res.invoicesToReview).toHaveLength(1);
  });

  it('404 si el salón no existe', async () => {
    const t = build({ companyExists: false });
    await expect(t.service.grantVip(99, 528)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminBillingService.revokeVip', () => {
  it('le quita el VIP y le da 15 días de prueba: no queda bloqueado', async () => {
    const t = build({
      sub: {
        billingExempt: true,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() - 90 * DAY),
        graceEndsAt: new Date(Date.now() - 80 * DAY),
      },
    });
    const before = Date.now();
    const res = await t.service.revokeVip(12, 528);

    expect(res.changed).toBe(true);
    const s = t.saved[0];
    expect(s.billingExempt).toBe(false);
    expect(s.graceEndsAt).toBeNull();
    expect(s.trialEndsAt!.getTime()).toBeGreaterThanOrEqual(before + 15 * DAY);
    expect(s.status).not.toBe('blocked');
  });

  it('si no era VIP no toca nada', async () => {
    const t = build({});
    const res = await t.service.revokeVip(12, 528);
    expect(res.changed).toBe(false);
    expect(t.saved).toHaveLength(0);
  });
});

describe('AdminBillingService.extendTrial', () => {
  it('prueba vencida sin pago: 15 días desde hoy y en trialing', async () => {
    const t = build({});
    const before = Date.now();
    const res = await t.service.extendTrial(12, 528);

    expect(res.changed).toBe(true);
    expect(t.saved[0].status).toBe('trialing');
    expect(t.saved[0].trialEndsAt!.getTime()).toBeGreaterThanOrEqual(
      before + 15 * DAY,
    );
    expect(t.invalidate).toHaveBeenCalledWith(12);
  });

  it('prueba que sigue corriendo: suma sobre lo que le queda', async () => {
    const end = new Date(Date.now() + 10 * DAY);
    const t = build({ sub: { status: 'trialing', trialEndsAt: end } });
    await t.service.extendTrial(12, 528);

    expect(t.saved[0].trialEndsAt!.getTime()).toBe(end.getTime() + 15 * DAY);
  });

  it('también a quien ya pagó: su mes pagado no se toca', async () => {
    const paidEnd = new Date(Date.now() - DAY);
    const t = build({
      sub: { currentPeriodEnd: paidEnd, graceEndsAt: null },
    });
    const res = await t.service.extendTrial(12, 528);

    expect(res.changed).toBe(true);
    expect(t.saved[0].currentPeriodEnd).toEqual(paidEnd);
    expect(t.saved[0].status).toBe('trialing');
  });

  it('pagado que llega más lejos: el estado sigue en active', async () => {
    const t = build({
      sub: { currentPeriodEnd: new Date(Date.now() + 60 * DAY) },
    });
    await t.service.extendTrial(12, 528);
    expect(t.saved[0].status).toBe('active');
  });

  it('a un VIP no: 409 y no se guarda nada', async () => {
    const t = build({ sub: { billingExempt: true } });
    await expect(t.service.extendTrial(12, 528)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(t.saved).toHaveLength(0);
  });

  it('sin suscripción: se le abre la prueba normal, sin sumar otros 15', async () => {
    const t = build({ sub: null });
    const res = await t.service.extendTrial(12, 528);

    expect(t.ensureSubscription).toHaveBeenCalledWith(12);
    expect(t.saved).toHaveLength(0);
    expect(res.message).toMatch(/se le abrió su prueba/);
  });

  it('404 si el salón no existe', async () => {
    const t = build({ companyExists: false });
    await expect(t.service.extendTrial(99, 528)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
