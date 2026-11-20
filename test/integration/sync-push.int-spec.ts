import {
  api,
  appointment,
  closeDb,
  futureSlot,
  minutesFromNow,
  newKey,
  q,
  seedSalon,
  type Salon,
} from './helpers/client';

/**
 * BE-OFF-5 contra MySQL real: POST /sync/push (varias operaciones offline en
 * una llamada). Lo que importa es lo que queda en la BASE.
 */

const PUSH = '/sync/push';

interface Op {
  idempotencyKey: string;
  type: 'create_client' | 'create_session';
  payload: Record<string, unknown>;
  clientRef?: string;
}

const push = (token: string, operations: Op[], ip?: string) =>
  api('POST', PUSH, {
    token,
    body: { operations },
    headers: ip ? { 'X-Forwarded-For': ip } : undefined,
  });

let idSeq = 0;
/** Cédula única por prueba. */
const cedula = () =>
  `V${10_000_000 + ((Date.now() + idSeq++ * 7919) % 89_999_999)}`;

const clientOp = (key = newKey(), extra: Record<string, unknown> = {}): Op => ({
  idempotencyKey: key,
  type: 'create_client',
  payload: {
    name: 'Rosa',
    lastName: 'Lote',
    identification: cedula(),
    ...extra,
  },
});

/** Cita SIN clientId, para usar con clientRef. */
const sessionOp = (
  salon: Salon,
  slot: { start: string; end: string },
  opts: {
    clientRef?: string;
    clientId?: number;
    key?: string;
    worker?: number;
  } = {},
): Op => {
  const payload = appointment(salon, {
    clientId: opts.clientId ?? 0,
    details: [{ ...slot, worker: opts.worker }],
  });
  if (!opts.clientId) delete payload.clientId;
  return {
    idempotencyKey: opts.key ?? newKey(),
    type: 'create_session',
    payload,
    ...(opts.clientRef ? { clientRef: opts.clientRef } : {}),
  };
};

const count = async (sql: string, params: unknown[]) =>
  (await q<Array<{ n: number }>>(sql, params))[0].n;

describe('BE-OFF-5 POST /sync/push (MySQL real)', () => {
  let salon: Salon;
  beforeAll(async () => {
    salon = await seedSalon();
  });
  afterAll(closeDb);

  it('cliente nuevo + cita para ese cliente: crea ambos y la cita queda ligada al cliente', async () => {
    const clientKey = newKey();
    const res = await push(salon.adminToken, [
      clientOp(clientKey),
      sessionOp(salon, futureSlot(80, 14), { clientRef: clientKey }),
    ]);
    expect(res.status).toBe(200);
    const [client, session] = res.body.results;
    expect(client).toMatchObject({ idempotencyKey: clientKey, status: 201 });
    expect(session.status).toBe(201);
    const clientId = client.body.clientId;
    expect(Number.isInteger(clientId)).toBe(true);

    const sessionId = session.body.createdDetails[0].sessionId;
    const [row] = await q<Array<{ client_id: number }>>(
      'SELECT client_id FROM session WHERE id = ?',
      [sessionId],
    );
    expect(row.client_id).toBe(clientId);
  });

  it('el cuerpo del cliente es IGUAL al del endpoint suelto (decisión 1-a)', async () => {
    const res = await push(salon.adminToken, [clientOp()]);
    expect(Object.keys(res.body.results[0].body).sort()).toEqual(
      ['clientId', 'message', 'user'].sort(),
    );
  });

  it('reenviar el MISMO lote no duplica nada: todo vuelve como replayed', async () => {
    const clientKey = newKey();
    const ops = [
      clientOp(clientKey),
      sessionOp(salon, futureSlot(81, 14), { clientRef: clientKey }),
    ];
    const first = await push(salon.adminToken, ops);
    const second = await push(salon.adminToken, ops);
    expect(second.status).toBe(200);
    for (const [i, r] of second.body.results.entries()) {
      expect(r.status).toBe(201);
      expect(r.replayed).toBe(true);
      expect(r.body).toEqual(first.body.results[i].body);
    }
    const clientId = first.body.results[0].body.clientId;
    expect(
      await count('SELECT COUNT(*) AS n FROM session WHERE client_id = ?', [
        clientId,
      ]),
    ).toBe(1);
    const [{ ident }] = await q<Array<{ ident: string }>>(
      'SELECT identification AS ident FROM client WHERE id = ?',
      [clientId],
    );
    expect(
      await count('SELECT COUNT(*) AS n FROM client WHERE identification = ?', [
        ident,
      ]),
    ).toBe(1);
  });

  it('un 409 SLOT_TAKEN en una operación no impide las otras', async () => {
    const slot = futureSlot(82, 14);
    const res = await push(salon.adminToken, [
      sessionOp(salon, slot, { clientId: salon.clientIds[0] }),
      sessionOp(salon, slot, { clientId: salon.clientIds[1] }),
      sessionOp(salon, futureSlot(82, 17), { clientId: salon.clientIds[2] }),
    ]);
    expect(res.body.results.map((r: any) => r.status)).toEqual([201, 409, 201]);
    expect(res.body.results[1].body.code).toBe('SLOT_TAKEN');
    expect(res.body.results[1].body.conflicts[0].conflictingSessionId).toBe(
      res.body.results[0].body.createdDetails[0].sessionId,
    );
  });

  it('si el cliente falla, la cita que depende de él responde 424 y su clave queda libre', async () => {
    const badClient = newKey();
    const dependent = newKey();
    const slot = futureSlot(83, 14);
    // Sin correo ni cédula: el endpoint de cliente responde 400.
    const res = await push(salon.adminToken, [
      {
        idempotencyKey: badClient,
        type: 'create_client',
        payload: { name: 'X' },
      },
      sessionOp(salon, slot, { clientRef: badClient, key: dependent }),
      sessionOp(salon, futureSlot(83, 17), { clientId: salon.clientIds[0] }),
    ]);
    const [c, s, other] = res.body.results;
    expect(c.status).toBe(400);
    expect(s.status).toBe(424);
    expect(s.body).toMatchObject({
      code: 'DEPENDENCY_FAILED',
      dependsOn: badClient,
    });
    expect(other.status).toBe(201);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM idempotency_key WHERE idem_key = ?',
        [dependent],
      ),
    ).toBe(0);

    // Corrigen el cliente (clave nueva) y reintentan la cita con SU clave.
    const fixedClient = newKey();
    const retry = await push(salon.adminToken, [
      clientOp(fixedClient),
      sessionOp(salon, slot, { clientRef: fixedClient, key: dependent }),
    ]);
    expect(retry.body.results.map((r: any) => r.status)).toEqual([201, 201]);
  });

  it('clientRef de un lote ANTERIOR funciona', async () => {
    const clientKey = newKey();
    const first = await push(salon.adminToken, [clientOp(clientKey)]);
    const second = await push(salon.adminToken, [
      sessionOp(salon, futureSlot(84, 14), { clientRef: clientKey }),
    ]);
    expect(second.body.results[0].status).toBe(201);
    expect(second.body.results[0].body.clientId).toBe(
      first.body.results[0].body.clientId,
    );
  });

  it('clientRef que no existe, o que apunta DESPUÉS en el lote: 424', async () => {
    const later = newKey();
    const res = await push(salon.adminToken, [
      sessionOp(salon, futureSlot(85, 14), { clientRef: newKey() }),
      sessionOp(salon, futureSlot(85, 16), { clientRef: later }),
      clientOp(later),
    ]);
    expect(res.body.results.map((r: any) => r.status)).toEqual([424, 424, 201]);
  });

  it('aislamiento: clientRef a un cliente creado por OTRO salón responde 424', async () => {
    const other = await seedSalon();
    const theirKey = newKey();
    const theirs = await push(other.adminToken, [clientOp(theirKey)]);
    expect(theirs.body.results[0].status).toBe(201);

    const res = await push(salon.adminToken, [
      sessionOp(salon, futureSlot(86, 14), { clientRef: theirKey }),
    ]);
    expect(res.body.results[0].status).toBe(424);
  });

  it('la misma operación suelta y luego en lote (y al revés) no se duplica', async () => {
    // Suelta → lote
    const key1 = newKey();
    const body1 = appointment(salon, {
      clientId: salon.clientIds[0],
      details: [futureSlot(87, 14)],
    });
    const single = await api('POST', '/sessions/create-with-detail', {
      token: salon.adminToken,
      body: body1,
      headers: { 'Idempotency-Key': key1 },
    });
    const batch = await push(salon.adminToken, [
      { idempotencyKey: key1, type: 'create_session', payload: body1 },
    ]);
    expect(single.status).toBe(201);
    expect(batch.body.results[0]).toMatchObject({
      status: 201,
      replayed: true,
    });
    expect(batch.body.results[0].body.createdDetails[0].sessionId).toBe(
      single.body.createdDetails[0].sessionId,
    );

    // Cliente en lote → suelto (form-data): misma clave, mismo cliente.
    const key2 = newKey();
    const payload = {
      name: 'Ida',
      lastName: 'Vuelta',
      identification: cedula(),
    };
    const inBatch = await push(salon.adminToken, [
      { idempotencyKey: key2, type: 'create_client', payload },
    ]);
    const form = new FormData();
    for (const [k, v] of Object.entries(payload)) form.append(k, v);
    const asSingle = await api('POST', '/auth/register/client-by-admin', {
      token: salon.adminToken,
      form,
      headers: { 'Idempotency-Key': key2 },
    });
    expect(asSingle.status).toBe(201);
    expect(asSingle.headers.get('idempotent-replayed')).toBe('true');
    expect(asSingle.body.clientId).toBe(inBatch.body.results[0].body.clientId);
  });

  it('la misma clave dos veces en el mismo lote: la segunda es replayed', async () => {
    const op = sessionOp(salon, futureSlot(88, 14), {
      clientId: salon.clientIds[1],
    });
    const res = await push(salon.adminToken, [op, op]);
    expect(res.body.results[0].status).toBe(201);
    expect(res.body.results[1]).toMatchObject({ status: 201, replayed: true });
  });

  it('un payload inválido falla SOLO esa operación (400 con el mismo mensaje del endpoint)', async () => {
    const res = await push(salon.adminToken, [
      {
        idempotencyKey: newKey(),
        type: 'create_session',
        payload: { clientId: salon.clientIds[0], campoRaro: 1, details: [] },
      },
      sessionOp(salon, futureSlot(89, 14), { clientId: salon.clientIds[0] }),
    ]);
    expect(res.body.results[0].status).toBe(400);
    expect(JSON.stringify(res.body.results[0].body.message)).toContain(
      'campoRaro',
    );
    expect(res.body.results[1].status).toBe(201);
  });

  it('createdOfflineAt (BE-OFF-3) funciona dentro del lote', async () => {
    const res = await push(salon.adminToken, [
      {
        idempotencyKey: newKey(),
        type: 'create_session',
        payload: appointment(salon, {
          clientId: salon.clientIds[2],
          details: [{ start: minutesFromNow(-180), end: minutesFromNow(-130) }],
          createdOfflineAt: minutesFromNow(-300),
        }),
      },
    ]);
    expect(res.body.results[0].status).toBe(201);
  });

  describe('validación del lote entero (400, no procesa nada)', () => {
    it.each([
      ['vacío', []],
      [
        'clave que no es UUID',
        [{ idempotencyKey: 'abc', type: 'create_client', payload: {} }],
      ],
      [
        'tipo desconocido',
        [{ idempotencyKey: newKey(), type: 'delete_all', payload: {} }],
      ],
      [
        'payload que no es objeto',
        [{ idempotencyKey: newKey(), type: 'create_client', payload: 'x' }],
      ],
    ])('%s', async (_name, operations) => {
      const res = await api('POST', PUSH, {
        token: salon.adminToken,
        body: { operations },
      });
      expect(res.status).toBe(400);
    });

    it('50 operaciones se aceptan; 51 no', async () => {
      const ok = await push(
        salon.adminToken,
        Array.from({ length: 50 }, () => clientOp()),
      );
      expect(ok.status).toBe(200);
      expect(ok.body.results).toHaveLength(50);
      expect(ok.body.results.every((r: any) => r.status === 201)).toBe(true);

      const tooMany = await push(
        salon.adminToken,
        Array.from({ length: 51 }, () => clientOp()),
      );
      expect(tooMany.status).toBe(400);
    });

    it('sin token: 401', async () => {
      const res = await api('POST', PUSH, { body: { operations: [] } });
      expect(res.status).toBe(401);
    });
  });

  it('trabajadora: su cita entra; una cita de OTRA trabajadora responde 403 y no frena el resto', async () => {
    const res = await push(salon.workers[0].token, [
      sessionOp(salon, futureSlot(90, 14), {
        clientId: salon.clientIds[0],
        worker: 1,
      }),
      sessionOp(salon, futureSlot(90, 16), {
        clientId: salon.clientIds[0],
        worker: 0,
      }),
    ]);
    expect(res.body.results.map((r: any) => r.status)).toEqual([403, 201]);
  });

  it('salón BLOQUEADO por falta de pago: la cita 403 (igual que el endpoint suelto), el cliente se crea (decisión 3-a)', async () => {
    const blocked = await seedSalon();
    await q(
      `UPDATE subscription
          SET billing_exempt = 0, plan_id = 'basico', status = 'blocked',
              trial_ends_at = UTC_TIMESTAMP() - INTERVAL 60 DAY,
              current_period_end = UTC_TIMESTAMP() - INTERVAL 40 DAY,
              grace_ends_at = UTC_TIMESTAMP() - INTERVAL 30 DAY
        WHERE company_id = ?`,
      [blocked.companyId],
    );
    const single = await api('POST', '/sessions/create-with-detail', {
      token: blocked.adminToken,
      body: appointment(blocked, { details: [futureSlot(91, 14)] }),
    });
    const res = await push(blocked.adminToken, [
      sessionOp(blocked, futureSlot(91, 16), {
        clientId: blocked.clientIds[0],
      }),
      clientOp(),
    ]);
    expect(single.status).toBe(403);
    expect(res.body.results[0].status).toBe(403);
    expect(res.body.results[0].body).toEqual(single.body);
    expect(res.body.results[1].status).toBe(201);
  });

  it('límite propio: el lote 11 en un minuto desde la misma IP recibe 429 (decisión 4)', async () => {
    const ip = `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      // Lote vacío (400 rápido): el límite cuenta igual.
      statuses.push((await push(salon.adminToken, [], ip)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  describe('tamaño del cuerpo', () => {
    const longNote = (kb: number) => 'x'.repeat(kb * 1024);

    it('50 citas con notas largas (~250 KB, más que el límite general de 100 KB) se procesan', async () => {
      const fresh = await seedSalon();
      const ops = Array.from({ length: 50 }, (_, i) => {
        const op = sessionOp(fresh, futureSlot(100 + i, 14), {
          clientId: fresh.clientIds[i % 3],
        });
        op.payload.description = longNote(5);
        return op;
      });
      expect(JSON.stringify({ operations: ops }).length).toBeGreaterThan(
        200 * 1024,
      );
      const res = await push(fresh.adminToken, ops);
      expect(res.status).toBe(200);
      expect(res.body.results.every((r: any) => r.status === 201)).toBe(true);
    });

    it('más de 1 MB: 413 y no se procesa nada', async () => {
      const op = clientOp();
      op.payload.location = longNote(1100);
      const res = await push(salon.adminToken, [op]);
      expect(res.status).toBe(413);
      expect(
        await count(
          'SELECT COUNT(*) AS n FROM idempotency_key WHERE idem_key = ?',
          [op.idempotencyKey],
        ),
      ).toBe(0);
    });

    it('el resto de la app sigue con el límite de 100 KB (no se subió para todos)', async () => {
      const body = appointment(salon, { details: [futureSlot(160, 14)] });
      body.description = longNote(150);
      const res = await api('POST', '/sessions/create-with-detail', {
        token: salon.adminToken,
        body,
      });
      expect(res.status).toBe(413);
    });
  });

  describe('carreras', () => {
    it('el MISMO lote enviado dos veces a la vez: nada se duplica y ninguno da 500', async () => {
      const fresh = await seedSalon();
      const clientKey = newKey();
      const ops = [
        clientOp(clientKey),
        sessionOp(fresh, futureSlot(170, 14), { clientRef: clientKey }),
      ];
      const [a, b] = await Promise.all([
        push(fresh.adminToken, ops),
        push(fresh.adminToken, ops),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const all = [...a.body.results, ...b.body.results];
      // Lo posible: creado, en curso (el otro lo tenía) o su cliente en curso.
      for (const r of all) expect([201, 409, 424]).toContain(r.status);
      for (const r of all.filter((x) => x.status === 409)) {
        expect(r.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      }
      // En la base: UN cliente y UNA cita, pase lo que pase.
      const clientIds = new Set(
        all
          .filter((r) => r.idempotencyKey === clientKey && r.status === 201)
          .map((r) => r.body.clientId),
      );
      expect(clientIds.size).toBe(1);
      const [clientId] = [...clientIds];
      expect(
        await count('SELECT COUNT(*) AS n FROM session WHERE client_id = ?', [
          clientId,
        ]),
      ).toBe(1);
    });

    it.each([1, 2, 3])(
      'ronda %p: dos teléfonos mandan lotes a la vez por el mismo horario → uno 201, el otro 409 SLOT_TAKEN',
      async (round) => {
        const fresh = await seedSalon();
        const slot = futureSlot(180 + round, 14);
        const [a, b] = await Promise.all([
          push(fresh.adminToken, [
            sessionOp(fresh, slot, { clientId: fresh.clientIds[0] }),
          ]),
          push(fresh.adminToken, [
            sessionOp(fresh, slot, { clientId: fresh.clientIds[1] }),
          ]),
        ]);
        const statuses = [
          a.body.results[0].status,
          b.body.results[0].status,
        ].sort();
        expect(statuses).toEqual([201, 409]);
        expect(
          await count(
            `SELECT COUNT(*) AS n FROM session_detail
              WHERE company_worker_id = ? AND status NOT IN (3, 4, 5)
                AND start_datetime = ?`,
            [fresh.workers[0].companyWorkerId, new Date(slot.start)],
          ),
        ).toBe(1);
      },
    );
  });

  describe('casos pequeños', () => {
    it('si vienen clientRef y clientId, gana clientRef', async () => {
      const clientKey = newKey();
      const op = sessionOp(salon, futureSlot(190, 14), {
        clientRef: clientKey,
      });
      op.payload.clientId = salon.clientIds[0];
      const res = await push(salon.adminToken, [clientOp(clientKey), op]);
      const created = res.body.results[0].body.clientId;
      expect(res.body.results[1].status).toBe(201);
      const [row] = await q<Array<{ client_id: number }>>(
        'SELECT client_id FROM session WHERE id = ?',
        [res.body.results[1].body.createdDetails[0].sessionId],
      );
      expect(row.client_id).toBe(created);
      expect(row.client_id).not.toBe(salon.clientIds[0]);
    });

    it('un 409 SLOT_TAKEN guardado se repite dentro del lote aunque el horario se libere', async () => {
      const slot = futureSlot(191, 14);
      const blocker = await push(salon.adminToken, [
        sessionOp(salon, slot, { clientId: salon.clientIds[0] }),
      ]);
      const loser = sessionOp(salon, slot, { clientId: salon.clientIds[1] });
      const first = await push(salon.adminToken, [loser]);
      expect(first.body.results[0].status).toBe(409);

      await api(
        'PATCH',
        `/sessions/${blocker.body.results[0].body.createdDetails[0].sessionId}/cancel`,
        { token: salon.adminToken, body: { reason: 'libera' } },
      );
      const again = await push(salon.adminToken, [loser]);
      expect(again.body.results[0]).toMatchObject({
        status: 409,
        replayed: true,
      });
      expect(again.body.results[0].body).toEqual(first.body.results[0].body);
    });

    it('trabajadora de un salón SIN la app del equipo: 403 por operación, igual que el endpoint suelto', async () => {
      const basic = await seedSalon();
      // Plan Básico (sin app del equipo), al día.
      await q(
        "UPDATE subscription SET plan_id = 'basico' WHERE company_id = ?",
        [basic.companyId],
      );
      const single = await api('POST', '/sessions/create-with-detail', {
        token: basic.workers[0].token,
        body: appointment(basic, { details: [futureSlot(192, 14)] }),
      });
      const res = await push(basic.workers[0].token, [
        sessionOp(basic, futureSlot(192, 16), {
          clientId: basic.clientIds[0],
        }),
      ]);
      expect(single.status).toBe(403);
      expect(res.body.results[0].status).toBe(403);
      expect(res.body.results[0].body).toEqual(single.body);
    });

    it('clientRef a un cliente que "todavía se está procesando": 424', async () => {
      const busyKey = newKey();
      await q(
        `INSERT INTO idempotency_key
           (user_id, idem_key, endpoint, request_hash, status, created_at)
         VALUES (?, ?, 'AuthController.registerClientByAdmin', ?, 'processing', UTC_TIMESTAMP())`,
        [salon.adminUserId, busyKey, 'h'.repeat(64)],
      );
      const res = await push(salon.adminToken, [
        sessionOp(salon, futureSlot(193, 14), { clientRef: busyKey }),
      ]);
      expect(res.body.results[0].status).toBe(424);
      expect(res.body.results[0].body.message).toMatch(/procesando/);
    });

    it('cliente con campos que no son texto: en lote y luego suelto (form-data) es la misma operación', async () => {
      const key = newKey();
      const payload = {
        name: 'Tipos',
        lastName: 'Mixtos',
        identification: cedula(),
        isActive: 1,
        birthdate: '1990-05-01',
      };
      const inBatch = await push(salon.adminToken, [
        { idempotencyKey: key, type: 'create_client', payload },
      ]);
      expect(inBatch.body.results[0].status).toBe(201);

      const form = new FormData();
      for (const [k, v] of Object.entries(payload)) form.append(k, String(v));
      const single = await api('POST', '/auth/register/client-by-admin', {
        token: salon.adminToken,
        form,
        headers: { 'Idempotency-Key': key },
      });
      expect(single.status).toBe(201);
      expect(single.headers.get('idempotent-replayed')).toBe('true');
      expect(single.body.clientId).toBe(inBatch.body.results[0].body.clientId);
    });
  });
});
