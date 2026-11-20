import { hashRequest } from '../../src/idempotency/idempotency.interceptor';
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
 * BE-OFF-1 contra MySQL real: Idempotency-Key en crear cita y crear cliente.
 * Lo que importa es lo que queda en la BASE: un reintento nunca crea dos.
 */

const CREATE = '/sessions/create-with-detail';
const ENDPOINT = 'SessionController.createSessionWithDetail';

const sessionsOf = async (clientId: number) =>
  (
    await q<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM session WHERE client_id = ?',
      [clientId],
    )
  )[0].n;

const sessionIdOf = (body: any): number => body?.createdDetails?.[0]?.sessionId;

describe('BE-OFF-1 Idempotency-Key (MySQL real)', () => {
  let salon: Salon;
  beforeAll(async () => {
    salon = await seedSalon();
  });
  afterAll(closeDb);

  it('reintento con la misma clave: devuelve la MISMA cita y en la base hay una sola', async () => {
    const clientId = salon.clientIds[0];
    const body = appointment(salon, { clientId, details: [futureSlot(5, 13)] });
    const key = newKey();

    const first = await api('POST', CREATE, {
      token: salon.adminToken,
      body,
      headers: { 'Idempotency-Key': key },
    });
    const second = await api('POST', CREATE, {
      token: salon.adminToken,
      body,
      headers: { 'Idempotency-Key': key },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    expect(sessionIdOf(second.body)).toBe(sessionIdOf(first.body));
    expect(await sessionsOf(clientId)).toBe(1);
  });

  it('sin header todo sigue como antes (apps viejas): cada envío crea otra', async () => {
    const clientId = salon.clientIds[1];
    const a = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { clientId, details: [futureSlot(5, 14)] }),
    });
    const b = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { clientId, details: [futureSlot(5, 16)] }),
    });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await sessionsOf(clientId)).toBe(2);
  });

  it('misma clave con otro body: 422 y no crea nada más', async () => {
    const clientId = salon.clientIds[2];
    const key = newKey();
    const ok = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { clientId, details: [futureSlot(6, 13)] }),
      headers: { 'Idempotency-Key': key },
    });
    const reused = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { clientId, details: [futureSlot(6, 15)] }),
      headers: { 'Idempotency-Key': key },
    });
    expect(ok.status).toBe(201);
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await sessionsOf(clientId)).toBe(1);
  });

  it.each(['abc', '123', 'not-a-uuid-at-all-0000000000000000000'])(
    'clave que no es UUID (%p): 400 sin crear nada',
    async (bad) => {
      const res = await api('POST', CREATE, {
        token: salon.adminToken,
        body: appointment(salon, { details: [futureSlot(7, 13)] }),
        headers: { 'Idempotency-Key': bad },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
    },
  );

  it('10 envíos SIMULTÁNEOS con la misma clave: una sola cita, ningún 500', async () => {
    const fresh = await seedSalon();
    const clientId = fresh.clientIds[0];
    const body = appointment(fresh, { clientId, details: [futureSlot(8, 13)] });
    const key = newKey();

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        api('POST', CREATE, {
          token: fresh.adminToken,
          body,
          headers: { 'Idempotency-Key': key },
        }),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    const created = results.filter((r) => r.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);
    // Todos los 201 son la MISMA cita.
    expect(new Set(created.map((r) => sessionIdOf(r.body))).size).toBe(1);
    // Los 409 son "en curso", no otra cosa.
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    }
    expect(await sessionsOf(clientId)).toBe(1);
  });

  it('la clave es POR USUARIO: otro salón con la misma clave crea lo suyo y no ve lo ajeno', async () => {
    const other = await seedSalon();
    const key = newKey();
    const mine = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { details: [futureSlot(9, 13)] }),
      headers: { 'Idempotency-Key': key },
    });
    const theirs = await api('POST', CREATE, {
      token: other.adminToken,
      body: appointment(other, { details: [futureSlot(9, 13)] }),
      headers: { 'Idempotency-Key': key },
    });
    expect([mine.status, theirs.status]).toEqual([201, 201]);
    expect(theirs.headers.get('idempotent-replayed')).toBeNull();
    expect(sessionIdOf(theirs.body)).not.toBe(sessionIdOf(mine.body));
    expect(theirs.body.clientId).toBe(other.clientIds[0]);
  });

  it('si falla, la clave se libera: el reintento corregido se ejecuta', async () => {
    const clientId = salon.clientIds[0];
    const key = newKey();
    const broken = appointment(salon, {
      clientId,
      details: [futureSlot(10, 13)],
    });
    (broken.details as any[])[0].serviceId = 999_999;
    const failed = await api('POST', CREATE, {
      token: salon.adminToken,
      body: broken,
      headers: { 'Idempotency-Key': key },
    });
    expect(failed.status).toBe(404);
    const [{ n }] = await q<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM idempotency_key WHERE idem_key = ?',
      [key],
    );
    expect(n).toBe(0);

    const fixed = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { clientId, details: [futureSlot(10, 13)] }),
      headers: { 'Idempotency-Key': key },
    });
    expect(fixed.status).toBe(201);
  });

  it('la misma clave en OTRO endpoint (crear cliente): 422', async () => {
    const key = newKey();
    const appt = await api('POST', CREATE, {
      token: salon.adminToken,
      body: appointment(salon, { details: [futureSlot(11, 13)] }),
      headers: { 'Idempotency-Key': key },
    });
    expect(appt.status).toBe(201);

    const form = new FormData();
    form.append('name', 'Otro');
    form.append('lastName', 'Endpoint');
    form.append('identification', `V${Date.now() % 100_000_000}`);
    const client = await api('POST', '/auth/register/client-by-admin', {
      token: salon.adminToken,
      form,
      headers: { 'Idempotency-Key': key },
    });
    expect(client.status).toBe(422);
    expect(client.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('crear cliente (form-data) dos veces con la misma clave: un solo cliente', async () => {
    const identification = `V${(Date.now() % 90_000_000) + 10_000_000}`;
    const send = () => {
      const form = new FormData();
      form.append('name', 'Sin');
      form.append('lastName', 'Red');
      form.append('identification', identification);
      return form;
    };
    const key = newKey();
    const a = await api('POST', '/auth/register/client-by-admin', {
      token: salon.adminToken,
      form: send(),
      headers: { 'Idempotency-Key': key },
    });
    const b = await api('POST', '/auth/register/client-by-admin', {
      token: salon.adminToken,
      form: send(),
      headers: { 'Idempotency-Key': key },
    });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.headers.get('idempotent-replayed')).toBe('true');
    expect(b.body.clientId).toBe(a.body.clientId);
    // La cédula se guarda normalizada (V-…): se cuenta por el valor guardado.
    const [{ saved: stored }] = await q<Array<{ saved: string }>>(
      'SELECT identification AS saved FROM client WHERE id = ?',
      [a.body.clientId],
    );
    expect(stored.replace(/\D/g, '')).toBe(identification.replace(/\D/g, ''));
    const [{ n }] = await q<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM client WHERE identification = ?',
      [stored],
    );
    expect(n).toBe(1);
  });

  describe('fila "en curso" (el servidor se cayó a mitad)', () => {
    const insertProcessing = async (
      key: string,
      body: Record<string, unknown>,
      minutesAgo: number,
    ) =>
      q(
        `INSERT INTO idempotency_key
           (user_id, idem_key, endpoint, request_hash, status, created_at)
         VALUES (?, ?, ?, ?, 'processing', UTC_TIMESTAMP() - INTERVAL ? MINUTE)`,
        [salon.adminUserId, key, ENDPOINT, hashRequest(body), minutesAgo],
      );

    it('reciente (menos de 2 min): 409 IDEMPOTENCY_IN_PROGRESS, no ejecuta', async () => {
      const clientId = salon.clientIds[1];
      const before = await sessionsOf(clientId);
      const body = appointment(salon, {
        clientId,
        details: [futureSlot(12, 13)],
      });
      const key = newKey();
      await insertProcessing(key, body, 0);
      const res = await api('POST', CREATE, {
        token: salon.adminToken,
        body,
        headers: { 'Idempotency-Key': key },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(await sessionsOf(clientId)).toBe(before);
    });

    it('abandonada (más de 2 min): se retoma y se ejecuta una sola vez', async () => {
      const clientId = salon.clientIds[2];
      const before = await sessionsOf(clientId);
      const body = appointment(salon, {
        clientId,
        details: [futureSlot(12, 15)],
      });
      const key = newKey();
      await insertProcessing(key, body, 3);
      const res = await api('POST', CREATE, {
        token: salon.adminToken,
        body,
        headers: { 'Idempotency-Key': key },
      });
      expect(res.status).toBe(201);
      expect(await sessionsOf(clientId)).toBe(before + 1);
      const [row] = await q<Array<{ status: string }>>(
        'SELECT status FROM idempotency_key WHERE idem_key = ?',
        [key],
      );
      expect(row.status).toBe('done');
    });
  });
});
