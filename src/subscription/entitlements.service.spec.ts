import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { EntitlementsService } from './entitlements.service';
import type { Company } from '../company/entities/company.entity';
import type { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import type { PaymentReport } from './entities/payment-report.entity';
import type { Subscription } from './entities/subscription.entity';
import type { PlanId } from './config/plans.config';

/**
 * Las pruebas que pide SUB-5: el Básico no accede a las funciones del Full aun
 * estando al día, el trabajador #3 se rechaza en Básico, y un pago pendiente
 * concede acceso pese a la gracia vencida.
 */

function days(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function buildService(options: {
  planId?: PlanId;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  graceEndsAt?: Date | null;
  pendingReports?: number;
  workers?: number;
  noSubscription?: boolean;
}): EntitlementsService {
  const subscription = options.noSubscription
    ? null
    : ({
        id: 1,
        companyId: 7,
        planId: options.planId ?? 'basico',
        status: 'active',
        trialEndsAt: options.trialEndsAt ?? null,
        // `in` y no `??`: un `currentPeriodEnd: null` explícito es el tenant en
        // prueba, que todavía no tiene período pagado.
        currentPeriodEnd:
          'currentPeriodEnd' in options
            ? (options.currentPeriodEnd ?? null)
            : days(10),
        graceEndsAt: options.graceEndsAt ?? null,
      } as Subscription);

  const subscriptions = { findOne: jest.fn().mockResolvedValue(subscription) };
  const reports = {
    countBy: jest.fn().mockResolvedValue(options.pendingReports ?? 0),
  };
  const workers = {
    countBy: jest.fn().mockResolvedValue(options.workers ?? 0),
  };
  const companies = { findOne: jest.fn().mockResolvedValue({ id: 7 }) };

  return new EntitlementsService(
    subscriptions as unknown as Repository<Subscription>,
    reports as unknown as Repository<PaymentReport>,
    workers as unknown as Repository<CompanyWorker>,
    companies as unknown as Repository<Company>,
    { get: () => undefined } as unknown as ConfigService,
  );
}

describe('el eje del plan', () => {
  it('el Básico al día NO accede a IA, nómina, análisis ni app del trabajador', async () => {
    const service = buildService({ planId: 'basico' });

    expect(await service.canOperate(7)).toBe(true);
    expect(await service.can(7, 'aiSuggestions')).toBe(false);
    expect(await service.can(7, 'payroll')).toBe(false);
    expect(await service.can(7, 'analytics')).toBe(false);
    expect(await service.can(7, 'workerApp')).toBe(false);
    expect(await service.can(7, 'prioritySupport')).toBe(false);
    // La app del cliente sí está en ambos planes.
    expect(await service.can(7, 'clientApp')).toBe(true);
  });

  it('el Full al día accede a todo', async () => {
    const service = buildService({ planId: 'full' });

    expect(await service.can(7, 'aiSuggestions')).toBe(true);
    expect(await service.can(7, 'payroll')).toBe(true);
    expect(await service.can(7, 'analytics')).toBe(true);
    expect(await service.can(7, 'workerApp')).toBe(true);
  });

  it('el Full bloqueado no accede a nada: fallan los dos ejes', async () => {
    const service = buildService({
      planId: 'full',
      currentPeriodEnd: days(-30),
    });

    expect(await service.canOperate(7)).toBe(false);
    expect(await service.can(7, 'payroll')).toBe(false);
  });

  it('pedir una función que el plan no incluye invita a subir de plan', async () => {
    const service = buildService({ planId: 'basico' });

    await expect(service.assertCanUseFeature(7, 'payroll')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.assertCanUseFeature(7, 'clientApp'),
    ).resolves.toBeUndefined();
  });
});

describe('el tope de trabajadores', () => {
  it('el Básico bloquea el trabajador #3', async () => {
    const service = buildService({ planId: 'basico', workers: 2 });

    await expect(service.assertCanAddWorker(7)).rejects.toThrow(
      /permite hasta 2 trabajadores/,
    );
  });

  it('el Básico admite el #2', async () => {
    const service = buildService({ planId: 'basico', workers: 1 });
    await expect(service.assertCanAddWorker(7)).resolves.toBeUndefined();
  });

  it('el Full admite más de 2', async () => {
    const service = buildService({ planId: 'full', workers: 5 });
    await expect(service.assertCanAddWorker(7)).resolves.toBeUndefined();
  });

  it('un Full con 20 trabajadores que baja a Básico no pierde a nadie, pero no puede sumar', async () => {
    const service = buildService({ planId: 'basico', workers: 20 });

    const response = await service.getAccessResponse(7);
    // Los 20 siguen contados: bajar de plan no destruye datos.
    expect(response.limits.workersInUse).toBe(20);
    expect(response.limits.canAddWorker).toBe(false);
    await expect(service.assertCanAddWorker(7)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('el eje del estado', () => {
  it('bloqueado: la operación se corta con motivo para la pantalla de pago', async () => {
    const service = buildService({ currentPeriodEnd: days(-30) });

    await expect(service.assertCanOperate(7)).rejects.toMatchObject({
      response: { reason: 'subscription_blocked' },
    });
  });

  it('un pago pendiente devuelve el acceso aunque la gracia esté vencida', async () => {
    const service = buildService({
      planId: 'full',
      currentPeriodEnd: days(-30),
      graceEndsAt: days(-25),
      pendingReports: 1,
    });

    expect(await service.canOperate(7)).toBe(true);
    expect(await service.can(7, 'payroll')).toBe(true);

    const response = await service.getAccessResponse(7);
    expect(response).toMatchObject({
      status: 'grace',
      canOperate: true,
      graceCause: 'pending_report',
      hasPendingReport: true,
    });
  });
});

describe('la foto para el frontend', () => {
  it('marca en false lo que el plan no incluye, con el tenant al día', async () => {
    const service = buildService({ planId: 'basico', workers: 1 });

    const response = await service.getAccessResponse(7);

    expect(response).toMatchObject({
      planId: 'basico',
      planName: 'Básico',
      status: 'active',
      canOperate: true,
    });
    expect(response.features).toEqual({
      payroll: false,
      analytics: false,
      aiSuggestions: false,
      workerApp: false,
      clientApp: true,
      prioritySupport: false,
    });
    expect(response.limits).toMatchObject({
      maxWorkers: 2,
      canAddWorker: true,
    });
  });

  it('bloqueado: todo en false, y el front sabe que es por estado y no por plan', async () => {
    const service = buildService({
      planId: 'full',
      currentPeriodEnd: days(-30),
    });

    const response = await service.getAccessResponse(7);

    expect(response.canOperate).toBe(false);
    expect(Object.values(response.features).every((v) => v === false)).toBe(
      true,
    );
  });
});

describe('la app del cliente final', () => {
  it('en un salón Full muestra la sugerencia con IA', async () => {
    const service = buildService({ planId: 'full' });
    expect(await service.getPublicFeatures(7)).toMatchObject({
      companyId: 7,
      aiSuggestions: true,
      clientApp: true,
    });
  });

  it('en un salón Básico la IA no se ofrece, pero la app sigue funcionando', async () => {
    const service = buildService({ planId: 'basico' });
    expect(await service.getPublicFeatures(7)).toMatchObject({
      aiSuggestions: false,
      clientApp: true,
    });
  });
});

describe('la prueba de 15 días', () => {
  /** Trial: sin período pagado todavía, la prueba corriendo. */
  const trial = { currentPeriodEnd: null, trialEndsAt: days(10) };

  it('accede a todo aunque no haya elegido plan', async () => {
    const service = buildService({ noSubscription: true });

    expect(await service.canOperate(7)).toBe(true);
    expect(await service.can(7, 'aiSuggestions')).toBe(true);
    expect(await service.can(7, 'payroll')).toBe(true);
    expect(await service.can(7, 'analytics')).toBe(true);
    expect(await service.can(7, 'workerApp')).toBe(true);
  });

  it('accede a todo aunque el plan elegido sea Básico', async () => {
    const service = buildService({ planId: 'basico', ...trial });

    expect(await service.can(7, 'aiSuggestions')).toBe(true);
    expect(await service.can(7, 'payroll')).toBe(true);
    await expect(
      service.assertCanUseFeature(7, 'payroll'),
    ).resolves.toBeUndefined();
  });

  it('no tiene tope de trabajadores', async () => {
    const service = buildService({ planId: 'basico', ...trial, workers: 9 });
    await expect(service.assertCanAddWorker(7)).resolves.toBeUndefined();
  });

  it('el panel lo pinta todo disponible y sin tope', async () => {
    const service = buildService({ planId: 'basico', ...trial, workers: 3 });

    const response = await service.getAccessResponse(7);

    // El panel muestra el plan que está USANDO, no la columna todavía sin elegir.
    expect(response).toMatchObject({
      status: 'trialing',
      canOperate: true,
      planId: 'full',
      planName: 'Full',
    });
    expect(Object.values(response.features).every((v) => v === true)).toBe(
      true,
    );
    expect(response.limits).toMatchObject({
      maxWorkers: null,
      workersInUse: 3,
      canAddWorker: true,
    });
  });

  it('la app del cliente muestra la IA de un salón en prueba', async () => {
    const service = buildService({ planId: 'basico', ...trial });
    expect(await service.getPublicFeatures(7)).toMatchObject({
      aiSuggestions: true,
      clientApp: true,
    });
  });

  it('al terminar la prueba, el Básico vuelve a sus límites', async () => {
    const service = buildService({
      planId: 'basico',
      trialEndsAt: days(-1),
      currentPeriodEnd: days(20),
      workers: 5,
    });

    expect(await service.can(7, 'aiSuggestions')).toBe(false);
    // Los 5 que sumó en la prueba se quedan; solo no puede sumar más.
    const response = await service.getAccessResponse(7);
    expect(response).toMatchObject({ planId: 'basico', planName: 'Básico' });
    expect(response.limits).toMatchObject({
      maxWorkers: 2,
      workersInUse: 5,
      canAddWorker: false,
    });
    await expect(service.assertCanAddWorker(7)).rejects.toThrow(
      /permite hasta 2 trabajadores/,
    );
  });
});
