/* eslint-disable @typescript-eslint/unbound-method --
 * Los handlers de los controladores se leen como VALOR para mirar su metadata.
 */

// `uuid` se publica como ESM y jest no lo transforma; importar los
// controladores lo arrastra.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { Repository } from 'typeorm';
import { AuthController } from '../auth/auth.controller';
import { SessionController } from '../session/session.controller';
import type { IdempotencyKey } from './entities/idempotency-key.entity';
import { IdempotencyInterceptor, hashRequest } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

const KEY = '3f2c1a9e-7b4d-4c8e-9a1f-0d2e3c4b5a69';
const dup = () =>
  Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

/* ------------------------------------------------------------------ */
/* Servicio                                                            */
/* ------------------------------------------------------------------ */

function buildService(opts: {
  saveImpl?: () => Promise<unknown>;
  existing?: Partial<IdempotencyKey> | null;
  staleAffected?: number;
}) {
  const execute = jest
    .fn()
    .mockResolvedValue({ affected: opts.staleAffected ?? 0 });
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute,
  };
  const repo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(opts.saveImpl ?? (() => Promise.resolve({ id: 10 }))),
    findOne: jest.fn().mockResolvedValue(opts.existing ?? null),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(() => qb),
  };
  return {
    service: new IdempotencyService(
      repo as unknown as Repository<IdempotencyKey>,
    ),
    repo,
    qb,
  };
}

const input = {
  userId: 7,
  key: KEY,
  endpoint: 'SessionController.createSessionWithDetail',
  requestHash: 'a'.repeat(64),
};

describe('IdempotencyService', () => {
  it('clave nueva: reserva la fila en processing', async () => {
    const t = buildService({});
    await expect(t.service.begin(input)).resolves.toEqual({
      kind: 'started',
      id: 10,
    });
    expect(t.repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        idemKey: KEY,
        status: 'processing',
      }),
    );
  });

  it('clave terminada con el mismo contenido: devuelve la respuesta guardada', async () => {
    const t = buildService({
      saveImpl: () => Promise.reject(dup()),
      existing: {
        id: 10,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        status: 'done',
        responseBody: JSON.stringify({ id: 5012 }),
      },
    });
    await expect(t.service.begin(input)).resolves.toEqual({
      kind: 'replay',
      body: { id: 5012 },
      status: null,
    });
    // Busca SIEMPRE por el usuario del token.
    expect(t.repo.findOne).toHaveBeenCalledWith({
      where: { userId: 7, idemKey: KEY },
    });
  });

  it('misma clave con otro contenido: 422', async () => {
    const t = buildService({
      saveImpl: () => Promise.reject(dup()),
      existing: {
        id: 10,
        endpoint: input.endpoint,
        requestHash: 'b'.repeat(64),
        status: 'done',
        responseBody: '{}',
      },
    });
    await expect(t.service.begin(input)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('misma clave en otro endpoint: 422', async () => {
    const t = buildService({
      saveImpl: () => Promise.reject(dup()),
      existing: {
        id: 10,
        endpoint: 'AuthController.registerClientByAdmin',
        requestHash: input.requestHash,
        status: 'done',
        responseBody: '{}',
      },
    });
    await expect(t.service.begin(input)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('clave aún en curso: 409 y no se ejecuta otra vez', async () => {
    const t = buildService({
      saveImpl: () => Promise.reject(dup()),
      existing: {
        id: 10,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        status: 'processing',
      },
      staleAffected: 0,
    });
    await expect(t.service.begin(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('clave abandonada (processing viejo): se retoma con UPDATE condicional', async () => {
    const t = buildService({
      saveImpl: () => Promise.reject(dup()),
      existing: {
        id: 10,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        status: 'processing',
      },
      staleAffected: 1,
    });
    await expect(t.service.begin(input)).resolves.toEqual({
      kind: 'started',
      id: 10,
    });
    expect(t.qb.andWhere).toHaveBeenCalledWith('status = :status', {
      status: 'processing',
    });
  });

  it('la fila que chocó desapareció: vuelve a reservar', async () => {
    let calls = 0;
    const t = buildService({
      saveImpl: () =>
        ++calls === 1 ? Promise.reject(dup()) : Promise.resolve({ id: 11 }),
      existing: null,
    });
    await expect(t.service.begin(input)).resolves.toEqual({
      kind: 'started',
      id: 11,
    });
  });

  it('otros errores de la base no se tapan', async () => {
    const t = buildService({
      saveImpl: () => Promise.reject(new Error('db down')),
    });
    await expect(t.service.begin(input)).rejects.toThrow('db down');
  });

  it('liberar solo borra filas en processing', async () => {
    const t = buildService({});
    await t.service.release(10);
    expect(t.repo.delete).toHaveBeenCalledWith({
      id: 10,
      status: 'processing',
    });
  });
});

/* ------------------------------------------------------------------ */
/* Interceptor                                                         */
/* ------------------------------------------------------------------ */

function ctx(headers: Record<string, unknown>, userId: number | null = 7) {
  const setHeader = jest.fn();
  const request = {
    headers,
    user: userId ? { sub: userId } : undefined,
    body: { clientId: 3, date: '2026-11-20' },
  };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
    getClass: () => SessionController,
    getHandler: () => SessionController.prototype.createSessionWithDetail,
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

function buildInterceptor(begin: unknown) {
  const service = {
    begin: jest.fn().mockResolvedValue(begin),
    complete: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  return {
    interceptor: new IdempotencyInterceptor(
      service as unknown as IdempotencyService,
    ),
    service,
  };
}

const handler = (result: unknown): CallHandler & { handle: jest.Mock } => ({
  handle: jest.fn(() => of(result)),
});

describe('IdempotencyInterceptor', () => {
  it('sin header: la petición sigue igual (apps viejas)', async () => {
    const t = buildInterceptor({ kind: 'started', id: 1 });
    const next = handler({ id: 1 });
    const out = await lastValueFrom(
      t.interceptor.intercept(ctx({}).context, next),
    );
    expect(out).toEqual({ id: 1 });
    expect(t.service.begin).not.toHaveBeenCalled();
  });

  it('header que no es UUID: 400', () => {
    const t = buildInterceptor({ kind: 'started', id: 1 });
    expect(() =>
      t.interceptor.intercept(
        ctx({ 'idempotency-key': 'abc' }).context,
        handler({}),
      ),
    ).toThrow(BadRequestException);
  });

  it('clave nueva: ejecuta y guarda la respuesta', async () => {
    const t = buildInterceptor({ kind: 'started', id: 10 });
    const next = handler({ id: 5012 });
    const out = await lastValueFrom(
      t.interceptor.intercept(
        ctx({ 'idempotency-key': KEY.toUpperCase() }).context,
        next,
      ),
    );
    expect(out).toEqual({ id: 5012 });
    expect(t.service.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        key: KEY, // normalizada en minúsculas
        endpoint: 'SessionController.createSessionWithDetail',
      }),
    );
    expect(t.service.complete).toHaveBeenCalledWith(10, { id: 5012 });
  });

  it('repetición: NO ejecuta el handler y marca la respuesta', async () => {
    const t = buildInterceptor({ kind: 'replay', body: { id: 5012 } });
    const next = handler({ id: 9999 });
    const c = ctx({ 'idempotency-key': KEY });
    const out = await lastValueFrom(t.interceptor.intercept(c.context, next));
    expect(out).toEqual({ id: 5012 });
    expect(next.handle).not.toHaveBeenCalled();
    expect(c.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('si el handler falla, libera la clave y devuelve el mismo error', async () => {
    const t = buildInterceptor({ kind: 'started', id: 10 });
    const boom = new ConflictException('horario ocupado');
    const next = { handle: jest.fn(() => throwError(() => boom)) };
    await expect(
      lastValueFrom(
        t.interceptor.intercept(ctx({ 'idempotency-key': KEY }).context, next),
      ),
    ).rejects.toBe(boom);
    expect(t.service.release).toHaveBeenCalledWith(10);
    expect(t.service.complete).not.toHaveBeenCalled();
  });

  it('BE-OFF-2: un 409 SLOT_TAKEN queda guardado para la clave (no se libera)', async () => {
    const t = buildInterceptor({ kind: 'started', id: 10 });
    const body = {
      statusCode: 409,
      code: 'SLOT_TAKEN',
      message: 'El trabajador ya tiene una cita en ese horario',
      conflicts: [{ detailIndex: 0, conflictingSessionId: 754 }],
    };
    const slotTaken = new ConflictException(body);
    const next = { handle: jest.fn(() => throwError(() => slotTaken)) };
    await expect(
      lastValueFrom(
        t.interceptor.intercept(ctx({ 'idempotency-key': KEY }).context, next),
      ),
    ).rejects.toBe(slotTaken);
    expect(t.service.complete).toHaveBeenCalledWith(10, body, 409);
    expect(t.service.release).not.toHaveBeenCalled();
  });

  it('BE-OFF-2: el reintento recibe el mismo 409 sin ejecutar nada', async () => {
    const body = { statusCode: 409, code: 'SLOT_TAKEN', conflicts: [] };
    const t = buildInterceptor({ kind: 'replay', body, status: 409 });
    const next = handler({ id: 9999 });
    const c = ctx({ 'idempotency-key': KEY });
    const error = await lastValueFrom(
      t.interceptor.intercept(c.context, next),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toEqual(body);
    expect(next.handle).not.toHaveBeenCalled();
    expect(c.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('si guardar el recibo falla, la respuesta sale igual', async () => {
    const t = buildInterceptor({ kind: 'started', id: 10 });
    t.service.complete.mockRejectedValue(new Error('db down'));
    const out = await lastValueFrom(
      t.interceptor.intercept(
        ctx({ 'idempotency-key': KEY }).context,
        handler({ id: 5012 }),
      ),
    );
    expect(out).toEqual({ id: 5012 });
  });
});

describe('hashRequest', () => {
  it('no depende del orden de los campos', () => {
    expect(hashRequest({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashRequest({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('cambia si cambia un dato o la foto', () => {
    const base = hashRequest({ a: 1 }, { buffer: Buffer.from('foto1') });
    expect(hashRequest({ a: 2 }, { buffer: Buffer.from('foto1') })).not.toBe(
      base,
    );
    expect(hashRequest({ a: 1 }, { buffer: Buffer.from('foto2') })).not.toBe(
      base,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Dónde está puesto                                                   */
/* ------------------------------------------------------------------ */

describe('endpoints protegidos', () => {
  const interceptorsOf = (h: unknown) =>
    (Reflect.getMetadata(INTERCEPTORS_METADATA, h as object) ??
      []) as unknown[];

  it('crear cita (dueño/trabajador) usa idempotencia', () => {
    expect(
      interceptorsOf(SessionController.prototype.createSessionWithDetail),
    ).toContain(IdempotencyInterceptor);
  });

  it('crear cliente usa idempotencia, después de leer la foto', () => {
    const list = interceptorsOf(AuthController.prototype.registerClientByAdmin);
    expect(list).toContain(IdempotencyInterceptor);
    expect(list.indexOf(IdempotencyInterceptor)).toBe(list.length - 1);
  });

  it('la cita que crea el cliente NO (decisión de producto)', () => {
    expect(
      interceptorsOf(SessionController.prototype.createSessionByClient),
    ).not.toContain(IdempotencyInterceptor);
  });
});
