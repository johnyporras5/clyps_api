jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { SyncService } from './sync.service';
import type { SyncOperationDto } from './dto/sync-push.dto';

/**
 * BE-OFF-5: la lógica de POST /sync/push sin base de datos. Las pruebas con
 * MySQL real están en test/integration/sync-push.int-spec.ts; estas corren en
 * el `npm test` de siempre (CI) y fijan las reglas del lote.
 */

const USER: AuthenticatedUser = {
  sub: 7,
  email: 'owner@example.test',
  userType: 'adm',
  companyId: 41,
  companyWorkerId: null,
};

const K = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const sessionPayload = (clientId?: number) => ({
  ...(clientId ? { clientId } : {}),
  startDatetime: '2026-12-01T15:00:00.000Z',
  details: [
    {
      serviceId: 25,
      companyWorkerId: 13,
      detailStartDatetime: '2026-12-01T15:00:00.000Z',
      detailEndDatetime: '2026-12-01T15:50:00.000Z',
    },
  ],
});

function build() {
  let nextId = 100;
  const idempotency = {
    begin: jest.fn(() => Promise.resolve({ kind: 'started', id: nextId++ })),
    complete: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    findResult: jest.fn().mockResolvedValue(null),
  };
  const sessionService = {
    createSessionWithDetail: jest.fn((dto: { clientId: number }) =>
      Promise.resolve({
        clientId: dto.clientId,
        createdDetails: [{ sessionId: 500 + dto.clientId }],
      }),
    ),
  };
  const authService = {
    registerClientByAdmin: jest.fn().mockResolvedValue({
      message: 'ok',
      user: null,
      clientId: 991,
    }),
  };
  const guard = { checkAccess: jest.fn().mockResolvedValue(true) };
  const realtime = { emitCreated: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notifyCreated: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SyncService(
    sessionService as never,
    authService as never,
    idempotency as never,
    guard as never,
    realtime as never,
    notifications as never,
  );
  return {
    service,
    idempotency,
    sessionService,
    authService,
    guard,
    realtime,
    notifications,
  };
}

const op = (o: Partial<SyncOperationDto>): SyncOperationDto =>
  ({ payload: {}, ...o }) as SyncOperationDto;

describe('SyncService (POST /sync/push)', () => {
  it('cliente + cita con clientRef: la cita recibe el id del cliente creado en el lote', async () => {
    const t = build();
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_client',
        payload: { name: 'Rosa', identification: 'V12345678' },
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(),
        clientRef: K(1),
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(t.sessionService.createSessionWithDetail).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 991 }),
      USER,
    );
    // Mismos avisos que el endpoint suelto.
    expect(t.realtime.emitCreated).toHaveBeenCalledWith(1491);
    expect(t.notifications.notifyCreated).toHaveBeenCalledWith(1491, USER.sub);
  });

  it('procesa en orden y un error no frena las demás', async () => {
    const t = build();
    t.sessionService.createSessionWithDetail
      .mockRejectedValueOnce(
        new ConflictException({ statusCode: 409, code: 'SLOT_TAKEN' }),
      )
      .mockImplementation((dto: { clientId: number }) =>
        Promise.resolve({
          clientId: dto.clientId,
          createdDetails: [{ sessionId: 1 }],
        }),
      );
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_session',
        payload: sessionPayload(1),
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(2),
      }),
    ]);
    expect(results.map((r) => [r.idempotencyKey, r.status])).toEqual([
      [K(1), 409],
      [K(2), 201],
    ]);
    // El SLOT_TAKEN se guarda (definitivo); no se libera la clave.
    expect(t.idempotency.complete).toHaveBeenCalledWith(
      100,
      { statusCode: 409, code: 'SLOT_TAKEN' },
      409,
    );
  });

  it('otros errores liberan la clave para el reintento', async () => {
    const t = build();
    t.sessionService.createSessionWithDetail.mockRejectedValueOnce(
      new NotFoundException('Servicio no encontrado'),
    );
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_session',
        payload: sessionPayload(1),
      }),
    ]);
    expect(results[0].status).toBe(404);
    expect(t.idempotency.release).toHaveBeenCalledWith(100);
  });

  it('si el cliente falla, la cita que depende de él da 424 y su clave no se reserva', async () => {
    const t = build();
    t.authService.registerClientByAdmin.mockRejectedValueOnce(
      new ConflictException('ya existe'),
    );
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_client',
        payload: { name: 'X' },
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(),
        clientRef: K(1),
      }),
    ]);
    expect(results[1]).toMatchObject({
      status: 424,
      body: { code: 'DEPENDENCY_FAILED', dependsOn: K(1) },
    });
    expect(t.sessionService.createSessionWithDetail).not.toHaveBeenCalled();
    // Solo se reservó la clave del cliente, no la de la cita.
    expect(t.idempotency.begin).toHaveBeenCalledTimes(1);
  });

  it('clientRef de un lote anterior: se busca SOLO entre las claves de este usuario', async () => {
    const t = build();
    t.idempotency.findResult.mockResolvedValueOnce({
      state: 'done',
      status: null,
      body: { clientId: 55 },
    });
    await t.service.push(USER, [
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(),
        clientRef: K(9).toUpperCase(),
      }),
    ]);
    expect(t.idempotency.findResult).toHaveBeenCalledWith(
      USER.sub,
      K(9),
      'AuthController.registerClientByAdmin',
    );
    expect(t.sessionService.createSessionWithDetail).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 55 }),
      USER,
    );
  });

  it('clientRef que apunta a una cita (no a un cliente): 424', async () => {
    const t = build();
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_session',
        payload: sessionPayload(3),
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(),
        clientRef: K(1),
      }),
    ]);
    expect(results[1].status).toBe(424);
  });

  it('clientRef en un create_client: 400', async () => {
    const t = build();
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_client',
        payload: { name: 'X' },
        clientRef: K(2),
      }),
    ]);
    expect(results[0]).toMatchObject({
      status: 400,
      body: { code: 'CLIENT_REF_NOT_ALLOWED' },
    });
  });

  it('clave ya procesada: devuelve lo guardado con replayed y no ejecuta nada', async () => {
    const t = build();
    t.idempotency.begin.mockResolvedValueOnce({
      kind: 'replay',
      body: { clientId: 3, createdDetails: [{ sessionId: 9 }] },
      status: null,
    } as never);
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_session',
        payload: sessionPayload(3),
      }),
    ]);
    expect(results[0]).toEqual({
      idempotencyKey: K(1),
      status: 201,
      body: { clientId: 3, createdDetails: [{ sessionId: 9 }] },
      replayed: true,
    });
    expect(t.sessionService.createSessionWithDetail).not.toHaveBeenCalled();
    expect(t.realtime.emitCreated).not.toHaveBeenCalled();
  });

  it('cada operación pasa por el bloqueo de SU endpoint', async () => {
    const t = build();
    await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_client',
        payload: { name: 'X' },
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(1),
      }),
    ]);
    const handlers = t.guard.checkAccess.mock.calls.map(
      (c: unknown[]) => (c[1] as { name: string }).name,
    );
    expect(handlers).toEqual([
      'registerClientByAdmin',
      'createSessionWithDetail',
    ]);
  });

  it('payload inválido: 400 solo en esa operación, con el mensaje del ValidationPipe', async () => {
    const t = build();
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_session',
        payload: { ...sessionPayload(1), campoRaro: 1 },
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_session',
        payload: sessionPayload(2),
      }),
    ]);
    expect(results[0].status).toBe(400);
    expect(JSON.stringify(results[0].body)).toContain('campoRaro');
    expect(results[1].status).toBe(201);
  });

  it('error inesperado: 500 genérico, sin detalles internos', async () => {
    const t = build();
    t.sessionService.createSessionWithDetail.mockRejectedValueOnce(
      new Error('ER_ACCESS_DENIED: password=secreta host=10.0.0.5'),
    );
    const { results } = await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_session',
        payload: sessionPayload(1),
      }),
    ]);
    expect(results[0]).toEqual({
      idempotencyKey: K(1),
      status: 500,
      body: { statusCode: 500, message: 'Internal server error' },
    });
    expect(JSON.stringify(results[0])).not.toContain('secreta');
  });

  it('el hash del cliente es el de su versión form-data (todo como texto)', async () => {
    const t = build();
    await t.service.push(USER, [
      op({
        idempotencyKey: K(1),
        type: 'create_client',
        payload: { name: 'A', isActive: 1 },
      }),
      op({
        idempotencyKey: K(2),
        type: 'create_client',
        payload: { name: 'A', isActive: '1' },
      }),
    ]);
    const [h1, h2] = t.idempotency.begin.mock.calls.map(
      (c: unknown[]) => (c[0] as { requestHash: string }).requestHash,
    );
    expect(h1).toBe(h2);
  });
});
