import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { SubscriptionAccessGuard } from './subscription-access.guard';
import {
  REQUIRES_FEATURE,
  REQUIRES_OPERATION,
  type OperationRule,
} from './requires-feature.decorator';
import type { EntitlementsService } from '../entitlements.service';
import type { UserRole } from '../../auth/types/authenticated-request';

/**
 * SUB-12: el portero del bloqueo. Lo que se prueba aquí es a QUIÉN corta y a
 * quién deja pasar —no el cálculo del acceso, que ya tiene sus pruebas en
 * `entitlements.service.spec.ts`—.
 */

function build(options: {
  operation?: OperationRule;
  feature?: string;
  mode?: string;
  blocked?: boolean;
  /** Funciones que el plan del salón NO incluye (SUB-14). */
  sinPlan?: string[];
}) {
  const assertCanOperate = jest.fn().mockImplementation(() => {
    if (options.blocked)
      return Promise.reject(
        new ForbiddenException({ reason: 'subscription_blocked' }),
      );
    return Promise.resolve({});
  });
  const assertCanUseFeature = jest.fn().mockResolvedValue(undefined);
  const assertPlanIncludes = jest
    .fn()
    .mockImplementation((_companyId: number, feature: string) => {
      if (options.sinPlan?.includes(feature))
        return Promise.reject(
          new ForbiddenException({ reason: 'plan_upgrade_required', feature }),
        );
      return Promise.resolve({});
    });
  const resolveCompanyIdForAdmin = jest.fn().mockResolvedValue(99);

  const entitlements = {
    assertCanOperate,
    assertCanUseFeature,
    assertPlanIncludes,
    resolveCompanyIdForAdmin,
  } as unknown as EntitlementsService;

  const reflector = {
    getAllAndOverride: (key: string) =>
      key === REQUIRES_FEATURE
        ? options.feature
        : key === REQUIRES_OPERATION
          ? options.operation
          : undefined,
  } as unknown as Reflector;

  const config = {
    get: (key: string) =>
      key === 'SUBSCRIPTION_ENFORCEMENT' ? options.mode : undefined,
  } as unknown as ConfigService;

  const guard = new SubscriptionAccessGuard(reflector, entitlements, config);

  const context = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user, method: 'POST', url: '/sessions' }),
      }),
    }) as unknown as ExecutionContext;

  const call = (userType: UserRole, companyId: number | null = 7) =>
    guard.canActivate(context({ sub: 1, userType, companyId }));

  return {
    guard,
    call,
    assertCanOperate,
    assertCanUseFeature,
    assertPlanIncludes,
    resolveCompanyIdForAdmin,
  };
}

const operativo: OperationRule = { allowWhenBlocked: [] };

describe('qué endpoints mira', () => {
  it('el endpoint sin marcar pasa de largo, sin preguntar nada', async () => {
    const { call, assertCanOperate } = build({ mode: 'on', blocked: true });

    await expect(call('adm')).resolves.toBe(true);
    expect(assertCanOperate).not.toHaveBeenCalled();
  });

  it('con el interruptor en off no corta a nadie', async () => {
    const { call, assertCanOperate } = build({
      operation: operativo,
      mode: 'off',
      blocked: true,
    });

    await expect(call('adm')).resolves.toBe(true);
    expect(assertCanOperate).not.toHaveBeenCalled();
  });

  it('en modo log calcula, anota y DEJA PASAR', async () => {
    const { call, assertCanOperate } = build({
      operation: operativo,
      mode: 'log',
      blocked: true,
    });

    await expect(call('adm')).resolves.toBe(true);
    expect(assertCanOperate).toHaveBeenCalled();
  });

  it('sin variable de entorno bloquea: no hay que acordarse de encenderlo', () => {
    const { guard } = build({ operation: operativo });
    expect(guard.mode).toBe('on');
  });

  it('un valor raro en la variable cae en el default, no rompe la petición', () => {
    const { guard } = build({ operation: operativo, mode: 'siempre' });
    expect(guard.mode).toBe('on');
  });
});

describe('a quién corta', () => {
  it('al dueño de un salón bloqueado', async () => {
    const { call } = build({
      operation: operativo,
      mode: 'on',
      blocked: true,
    });

    await expect(call('adm')).rejects.toThrow(ForbiddenException);
  });

  it('al trabajador, y le pasa su rol para que el mensaje sea el suyo', async () => {
    const { call, assertCanOperate } = build({
      operation: operativo,
      mode: 'on',
      blocked: true,
    });

    await expect(call('wrk')).rejects.toThrow(ForbiddenException);
    expect(assertCanOperate).toHaveBeenCalledWith(7, 'wrk');
  });

  it('al trabajador NO, si el endpoint lo exime (su nómina)', async () => {
    const { call, assertCanOperate } = build({
      operation: { allowWhenBlocked: ['wrk'] },
      mode: 'on',
      blocked: true,
    });

    await expect(call('wrk')).resolves.toBe(true);
    expect(assertCanOperate).not.toHaveBeenCalled();
  });

  /**
   * SUB-14, la trampa que separó los dos ejes: la exención es del bloqueo por
   * DEUDA. Si el salón nunca compró la app del equipo, el trabajador no entra
   * ni por la puerta que lo exime — no hay nada que eximir, no lo compraron.
   */
  it('al trabajador exento SÍ, si el salón no tiene la app del equipo', async () => {
    const { call, assertCanOperate, assertPlanIncludes } = build({
      operation: { allowWhenBlocked: ['wrk'] },
      mode: 'on',
      sinPlan: ['workerApp'],
    });

    await expect(call('wrk')).rejects.toThrow(ForbiddenException);
    expect(assertCanOperate).not.toHaveBeenCalled();
    expect(assertPlanIncludes).toHaveBeenCalledWith(7, 'workerApp', 'wrk');
  });

  it('al dueño exento no se le mira ningún plan: se va sin tocar la base', async () => {
    const {
      call,
      assertCanOperate,
      assertPlanIncludes,
      resolveCompanyIdForAdmin,
    } = build({
      operation: { allowWhenBlocked: ['adm'] },
      mode: 'on',
      blocked: true,
    });

    await expect(call('adm', null)).resolves.toBe(true);
    expect(assertCanOperate).not.toHaveBeenCalled();
    expect(assertPlanIncludes).not.toHaveBeenCalled();
    expect(resolveCompanyIdForAdmin).not.toHaveBeenCalled();
  });

  it('al dueño SÍ, aunque el endpoint exima al trabajador', async () => {
    const { call } = build({
      operation: { allowWhenBlocked: ['wrk'] },
      mode: 'on',
      blocked: true,
    });

    await expect(call('adm')).rejects.toThrow(ForbiddenException);
  });

  /**
   * La trampa que motivó esta salida temprana: el token del cliente viaja SIN
   * companyId porque es cliente de varios salones. Sin ella recibía "No tienes
   * una compañía asignada" —en salones al día también—, un error que no tiene
   * nada que ver con el bloqueo.
   */
  it('al cliente final nunca: su bloqueo se decide al agendar, no aquí', async () => {
    const { call, assertCanOperate } = build({
      operation: operativo,
      mode: 'on',
      blocked: true,
    });

    await expect(call('cli', null)).resolves.toBe(true);
    expect(assertCanOperate).not.toHaveBeenCalled();
  });

  it('al admin de la plataforma tampoco: no pertenece a ningún salón', async () => {
    const { call, assertCanOperate } = build({
      operation: operativo,
      mode: 'on',
      blocked: true,
    });

    await expect(call('padm', null)).resolves.toBe(true);
    expect(assertCanOperate).not.toHaveBeenCalled();
  });

  it('al dueño sin claim en el token se le resuelve la company', async () => {
    const { call, assertCanOperate, resolveCompanyIdForAdmin } = build({
      operation: operativo,
      mode: 'on',
    });

    await expect(call('adm', null)).resolves.toBe(true);
    expect(resolveCompanyIdForAdmin).toHaveBeenCalledWith(1);
    expect(assertCanOperate).toHaveBeenCalledWith(99, 'adm');
  });

  it('al trabajador sin salón en el token se le corta', async () => {
    const { call } = build({ operation: operativo, mode: 'on' });

    await expect(call('wrk', null)).rejects.toThrow(
      'No tienes una compañía asignada',
    );
  });

  /**
   * En modo `log` el guard NO puede sacar a nadie, ni por el camino de "no
   * encontré tu company": el dueño recién registrado, o el trabajador cuyo
   * token viejo no trae el claim, seguían entrando antes de SUB-12 y tienen que
   * seguir entrando durante el estreno.
   */
  it('en modo log no corta ni al que no tiene company', async () => {
    const { call } = build({ operation: operativo, mode: 'log' });

    await expect(call('wrk', null)).resolves.toBe(true);
  });

  it('sin sesión no hay a quién preguntarle', async () => {
    const { guard } = build({ operation: operativo, mode: 'on' });

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({}) }),
      } as unknown as ExecutionContext),
    ).rejects.toThrow('Sesión no válida');
  });
});

describe('el eje del plan', () => {
  it('un endpoint con función del plan pregunta por la función, con el rol', async () => {
    const { call, assertPlanIncludes } = build({
      feature: 'payroll',
      mode: 'on',
    });

    await expect(call('adm')).resolves.toBe(true);
    expect(assertPlanIncludes).toHaveBeenCalledWith(7, 'payroll', 'adm');
  });

  it('corta al dueño de un Básico que pide una función del Full', async () => {
    const { call } = build({
      feature: 'payroll',
      mode: 'on',
      sinPlan: ['payroll'],
    });

    await expect(call('adm')).rejects.toThrow(ForbiddenException);
  });

  /**
   * El orden importa: al dueño que DEBE se le manda a pagar, no a comparar
   * planes. Si fallan los dos ejes a la vez, habla el del pago.
   */
  it('debiendo y sin el plan, el 403 que sale es el de la deuda', async () => {
    const { call } = build({
      feature: 'payroll',
      mode: 'on',
      blocked: true,
      sinPlan: ['payroll'],
    });

    await expect(call('adm')).rejects.toMatchObject({
      response: { reason: 'subscription_blocked' },
    });
  });

  /**
   * SUB-14: la app del equipo no se marca endpoint por endpoint —se olvidaría
   * uno—. Todo trabajador que toca una puerta marcada la necesita.
   */
  it('al trabajador se le exige la app del equipo aunque el endpoint no pida función', async () => {
    const { call, assertPlanIncludes } = build({
      operation: operativo,
      mode: 'on',
      sinPlan: ['workerApp'],
    });

    await expect(call('wrk')).rejects.toThrow(ForbiddenException);
    expect(assertPlanIncludes).toHaveBeenCalledWith(7, 'workerApp', 'wrk');
  });

  it('al dueño no se le exige la app del equipo: su panel no es esa app', async () => {
    const { call, assertPlanIncludes } = build({
      operation: operativo,
      mode: 'on',
      sinPlan: ['workerApp'],
    });

    await expect(call('adm')).resolves.toBe(true);
    expect(assertPlanIncludes).not.toHaveBeenCalled();
  });

  it('con el interruptor en log, el que no tiene el plan igual entra', async () => {
    const { call } = build({
      operation: operativo,
      mode: 'log',
      sinPlan: ['workerApp'],
    });

    await expect(call('wrk')).resolves.toBe(true);
  });
});
