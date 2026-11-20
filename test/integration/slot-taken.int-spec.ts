import {
  api,
  appointment,
  closeDb,
  futureSlot,
  newKey,
  q,
  seedSalon,
  type Salon,
} from './helpers/client';

/**
 * BE-OFF-2 contra MySQL real: choque de horario al crear cita (409
 * SLOT_TAKEN), en transacción con bloqueo por trabajadora.
 */

const CREATE = '/sessions/create-with-detail';

/** Servicios ACTIVOS (no cancelados/completados) de una trabajadora en un rango. */
const activeDetailsIn = async (cwId: number, start: string, end: string) =>
  (
    await q<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM session_detail
        WHERE company_worker_id = ? AND status NOT IN (3, 4, 5)
          AND start_datetime < ? AND end_datetime > ?`,
      [cwId, new Date(end), new Date(start)],
    )
  )[0].n;

const sessionsOf = async (clientId: number) =>
  (
    await q<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM session WHERE client_id = ?',
      [clientId],
    )
  )[0].n;

const sessionIdOf = (body: any): number => body?.createdDetails?.[0]?.sessionId;

const at = (iso: string, plusMinutes: number) =>
  new Date(new Date(iso).getTime() + plusMinutes * 60_000).toISOString();

describe('BE-OFF-2 SLOT_TAKEN (MySQL real)', () => {
  let salon: Salon;
  beforeAll(async () => {
    salon = await seedSalon();
  });
  afterAll(closeDb);

  const create = (body: unknown, token = salon.adminToken, key?: string) =>
    api('POST', CREATE, {
      token,
      body,
      headers: key ? { 'Idempotency-Key': key } : undefined,
    });

  it('se encima con otra de la misma trabajadora: 409 con el formato del ticket y no crea nada', async () => {
    const slot = futureSlot(20, 14);
    const first = await create(appointment(salon, { details: [slot] }));
    expect(first.status).toBe(201);
    const clientId = salon.clientIds[1];
    const before = await sessionsOf(clientId);

    const clash = await create(
      appointment(salon, {
        clientId,
        details: [{ start: at(slot.start, 20), end: at(slot.start, 70) }],
      }),
    );

    expect(clash.status).toBe(409);
    expect(clash.body).toEqual({
      statusCode: 409,
      code: 'SLOT_TAKEN',
      message: 'El trabajador ya tiene una cita en ese horario',
      conflicts: [
        {
          detailIndex: 0,
          companyWorkerId: salon.workers[0].companyWorkerId,
          startDatetime: at(slot.start, 20),
          endDatetime: at(slot.start, 70),
          conflictingSessionId: sessionIdOf(first.body),
        },
      ],
    });
    expect(clash.body.conflicts[0].startDatetime).toMatch(/Z$/);
    expect(await sessionsOf(clientId)).toBe(before);
  });

  it('tocarse en el borde no choca (antes y después)', async () => {
    const slot = futureSlot(21, 14);
    expect((await create(appointment(salon, { details: [slot] }))).status).toBe(
      201,
    );
    const after = await create(
      appointment(salon, {
        clientId: salon.clientIds[1],
        details: [{ start: slot.end, end: at(slot.end, 50) }],
      }),
    );
    const before = await create(
      appointment(salon, {
        clientId: salon.clientIds[2],
        details: [{ start: at(slot.start, -50), end: slot.start }],
      }),
    );
    expect([after.status, before.status]).toEqual([201, 201]);
  });

  it('otra trabajadora a la misma hora: se crea', async () => {
    const slot = futureSlot(22, 14);
    const a = await create(appointment(salon, { details: [slot] }));
    const b = await create(
      appointment(salon, {
        clientId: salon.clientIds[1],
        details: [{ ...slot, worker: 1 }],
      }),
    );
    expect([a.status, b.status]).toEqual([201, 201]);
  });

  it('una cita CANCELADA no ocupa el horario', async () => {
    const slot = futureSlot(23, 14);
    const first = await create(appointment(salon, { details: [slot] }));
    const cancel = await api(
      'PATCH',
      `/sessions/${sessionIdOf(first.body)}/cancel`,
      { token: salon.adminToken, body: { reason: 'prueba' } },
    );
    expect(cancel.status).toBe(200);
    const again = await create(
      appointment(salon, { clientId: salon.clientIds[1], details: [slot] }),
    );
    expect(again.status).toBe(201);
  });

  it.each([3, 4])(
    'un servicio en estado %p (completado/pagado) no ocupa el horario',
    async (status) => {
      const slot = futureSlot(24, 10 + status);
      const first = await create(appointment(salon, { details: [slot] }));
      await q('UPDATE session_detail SET status = ? WHERE session_id = ?', [
        status,
        sessionIdOf(first.body),
      ]);
      const again = await create(
        appointment(salon, { clientId: salon.clientIds[1], details: [slot] }),
      );
      expect(again.status).toBe(201);
    },
  );

  it('dos servicios, el SEGUNDO choca: 409 con detailIndex 1 y no se crea NI el primero', async () => {
    const busy = futureSlot(25, 16);
    expect((await create(appointment(salon, { details: [busy] }))).status).toBe(
      201,
    );
    const clientId = salon.clientIds[2];
    const before = await sessionsOf(clientId);
    const free = futureSlot(25, 12);

    const res = await create(
      appointment(salon, {
        clientId,
        details: [free, { start: at(busy.start, 10), end: at(busy.start, 40) }],
      }),
    );

    expect(res.status).toBe(409);
    expect(res.body.conflicts.map((c: any) => c.detailIndex)).toEqual([1]);
    expect(await sessionsOf(clientId)).toBe(before);
    expect(
      await activeDetailsIn(
        salon.workers[0].companyWorkerId,
        free.start,
        free.end,
      ),
    ).toBe(0);
  });

  it('informa TODOS los choques', async () => {
    const a = futureSlot(26, 12);
    const b = futureSlot(26, 15);
    expect((await create(appointment(salon, { details: [a] }))).status).toBe(
      201,
    );
    expect(
      (
        await create(
          appointment(salon, {
            clientId: salon.clientIds[1],
            details: [{ ...b, worker: 1 }],
          }),
        )
      ).status,
    ).toBe(201);
    const res = await create(
      appointment(salon, {
        clientId: salon.clientIds[2],
        details: [a, { ...b, worker: 1 }],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.conflicts.map((c: any) => c.detailIndex)).toEqual([0, 1]);
  });

  it('una cita que cruza la medianoche (Caracas) también choca', async () => {
    // 03:30–04:30 UTC = 23:30–00:30 en Caracas: cruza el día del negocio.
    const base = futureSlot(27, 3);
    const late = { start: at(base.start, 30), end: at(base.start, 90) };
    expect((await create(appointment(salon, { details: [late] }))).status).toBe(
      201,
    );
    const res = await create(
      appointment(salon, {
        clientId: salon.clientIds[1],
        details: [{ start: at(base.start, 60), end: at(base.start, 110) }],
      }),
    );
    expect(res.status).toBe(409);
  });

  describe('carreras: peticiones simultáneas', () => {
    it.each([1, 2, 3])(
      'ronda %p: 8 citas a la vez para la misma trabajadora y hora → 1 se crea, 7 reciben 409',
      async (round) => {
        const fresh = await seedSalon();
        const slot = futureSlot(30 + round, 14);
        const results = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            create(
              appointment(fresh, {
                clientId: fresh.clientIds[i % 3],
                details: [slot],
              }),
              fresh.adminToken,
              newKey(),
            ),
          ),
        );
        const statuses = results.map((r) => r.status).sort();
        expect(statuses.filter((s) => s === 201)).toHaveLength(1);
        expect(statuses.filter((s) => s === 409)).toHaveLength(7);
        for (const r of results.filter((x) => x.status === 409)) {
          expect(r.body.code).toBe('SLOT_TAKEN');
        }
        expect(
          await activeDetailsIn(
            fresh.workers[0].companyWorkerId,
            slot.start,
            slot.end,
          ),
        ).toBe(1);
      },
    );

    it('trabajadoras distintas en paralelo no se bloquean entre sí', async () => {
      const fresh = await seedSalon();
      const slot = futureSlot(40, 14);
      const [a, b] = await Promise.all([
        create(appointment(fresh, { details: [slot] }), fresh.adminToken),
        create(
          appointment(fresh, {
            clientId: fresh.clientIds[1],
            details: [{ ...slot, worker: 1 }],
          }),
          fresh.adminToken,
        ),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
    });

    it('sin deadlock: citas con las dos trabajadoras en orden inverso, a la vez', async () => {
      const fresh = await seedSalon();
      const s1 = futureSlot(41, 12);
      const s2 = futureSlot(41, 16);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          create(
            appointment(fresh, {
              clientId: fresh.clientIds[i % 3],
              // Mitad A→B, mitad B→A, en horarios distintos por pareja.
              details:
                i % 2 === 0
                  ? [
                      { ...s1, worker: 0 },
                      { ...futureSlot(42 + i, 12), worker: 1 },
                    ]
                  : [
                      { ...futureSlot(42 + i, 16), worker: 1 },
                      { ...s2, worker: 0 },
                    ],
            }),
            fresh.adminToken,
          ),
        ),
      );
      // Ninguna falla por deadlock (500): o se crea, o choca con 409.
      for (const r of results) expect([201, 409]).toContain(r.status);
      expect(results.filter((r) => r.status === 201).length).toBeGreaterThan(0);
    });
  });

  describe('con BE-OFF-1: el 409 queda guardado para la clave', () => {
    it('el reintento recibe el mismo 409 aunque el horario se libere; con clave nueva se crea', async () => {
      const slot = futureSlot(50, 14);
      const blocker = await create(appointment(salon, { details: [slot] }));
      const body = appointment(salon, {
        clientId: salon.clientIds[1],
        details: [slot],
      });
      const key = newKey();

      const first = await create(body, salon.adminToken, key);
      expect(first.status).toBe(409);

      await api('PATCH', `/sessions/${sessionIdOf(blocker.body)}/cancel`, {
        token: salon.adminToken,
        body: { reason: 'libera el horario' },
      });

      const retry = await create(body, salon.adminToken, key);
      expect(retry.status).toBe(409);
      expect(retry.headers.get('idempotent-replayed')).toBe('true');
      expect(retry.body).toEqual(first.body);

      const [row] = await q<Array<{ status: string; response_status: number }>>(
        'SELECT status, response_status FROM idempotency_key WHERE idem_key = ?',
        [key],
      );
      expect(row).toEqual({ status: 'done', response_status: 409 });

      const fresh = await create(body, salon.adminToken, newKey());
      expect(fresh.status).toBe(201);
    });
  });
});
