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
}) {
  const assertCanOperate = jest.fn().mockImplementation(() => {
    if (options.blocked)
      return Promise.reject(
        new ForbiddenException({ reason: 'subscription_blocked' }),
      );
    return Promise.resolve({});
  });
  const assertCanUseFeature = jest.fn().mockResolvedValue(undefined);
  const resolveCompanyIdForAdmin = jest.fn().mockResolvedValue(99);

  const entitlements = {
    assertCanOperate,
    assertCanUseFeature,
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

describe('el eje del plan sigue funcionando', () => {
  it('un endpoint con función del plan pregunta por la función, con el rol', async () => {
    const { call, assertCanUseFeature } = build({
      feature: 'payroll',
      mode: 'on',
    });

    await expect(call('adm')).resolves.toBe(true);
    expect(assertCanUseFeature).toHaveBeenCalledWith(7, 'payroll', 'adm');
  });
});
