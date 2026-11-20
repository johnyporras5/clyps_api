import {
  api,
  appointment,
  closeDb,
  futureSlot,
  insertRow,
  minutesFromNow,
  newKey,
  q,
  seedSalon,
  type Salon,
} from './helpers/client';

/**
 * BE-OFF-3 contra MySQL real: citas agendadas sin red que llegan cuando ya
 * pasaron (`createdOfflineAt`).
 */

const CREATE = '/sessions/create-with-detail';
const sessionIdOf = (body: any): number => body?.createdDetails?.[0]?.sessionId;

/** Tramo de 50 min que empezó hace `hoursAgo` horas. */
const pastSlot = (hoursAgo: number) => ({
  start: minutesFromNow(-hoursAgo * 60),
  end: minutesFromNow(-hoursAgo * 60 + 50),
});

const statusOf = async (sessionId: number) =>
  (
    await q<Array<{ s: number }>>(
      'SELECT session_status AS s FROM session WHERE id = ?',
      [sessionId],
    )
  )[0].s;

describe('BE-OFF-3 createdOfflineAt (MySQL real)', () => {
  let salon: Salon; // SIN "permitir citas pasadas"
  let permissive: Salon; // CON "permitir citas pasadas"
  beforeAll(async () => {
    salon = await seedSalon();
    permissive = await seedSalon({ allowPastAppointments: true });
  });
  afterAll(closeDb);

  const create = (s: Salon, body: unknown, token = s.adminToken) =>
    api('POST', CREATE, { token, body });

  describe('dueño', () => {
    it('cita pasada SIN el campo: 400 como siempre', async () => {
      const res = await create(
        salon,
        appointment(salon, { details: [pastSlot(3)] }),
      );
      expect(res.status).toBe(400);
    });

    it('cita pasada agendada sin red ANTES de su hora: 201, entra AGENDADA y guarda el campo', async () => {
      const offlineAt = minutesFromNow(-5 * 60);
      const res = await create(
        salon,
        appointment(salon, {
          details: [pastSlot(3)],
          createdOfflineAt: offlineAt,
        }),
      );
      expect(res.status).toBe(201);
      const id = sessionIdOf(res.body);
      expect(await statusOf(id)).toBe(1);

      const [row] = await q<Array<{ v: Date }>>(
        'SELECT created_offline_at AS v FROM session WHERE id = ?',
        [id],
      );
      // Guardado exacto, en UTC (al segundo: la columna no guarda milisegundos).
      expect(
        Math.abs(row.v.getTime() - new Date(offlineAt).getTime()),
      ).toBeLessThan(1000);

      const detail = await api('GET', `/sessions/${id}`, {
        token: salon.adminToken,
      });
      expect(detail.status).toBe(200);
      expect(
        Math.abs(
          new Date(detail.body.createdOfflineAt).getTime() -
            new Date(offlineAt).getTime(),
        ),
      ).toBeLessThan(1000);
    });

    it('salón con "citas pasadas": sin el campo entra COMPLETADA; con el campo, AGENDADA', async () => {
      const without = await create(
        permissive,
        appointment(permissive, { details: [pastSlot(4)] }),
      );
      const withField = await create(
        permissive,
        appointment(permissive, {
          clientId: permissive.clientIds[1],
          details: [pastSlot(6)],
          createdOfflineAt: minutesFromNow(-8 * 60),
        }),
      );
      expect([without.status, withField.status]).toEqual([201, 201]);
      expect(await statusOf(sessionIdOf(without.body))).toBe(3);
      expect(await statusOf(sessionIdOf(withField.body))).toBe(1);
    });

    it('cita futura con el campo: normal, y el campo queda guardado', async () => {
      const res = await create(
        salon,
        appointment(salon, {
          details: [futureSlot(60, 14)],
          createdOfflineAt: minutesFromNow(-10),
        }),
      );
      expect(res.status).toBe(201);
      const [row] = await q<Array<{ v: Date | null }>>(
        'SELECT created_offline_at AS v FROM session WHERE id = ?',
        [sessionIdOf(res.body)],
      );
      expect(row.v).not.toBeNull();
    });
  });

  describe('trabajadora (nunca puede citas pasadas sin el campo)', () => {
    it('sin el campo: 400', async () => {
      const res = await create(
        salon,
        appointment(salon, { details: [pastSlot(10)] }),
        salon.workers[0].token,
      );
      expect(res.status).toBe(400);
    });

    it('con el campo anterior al inicio: 201 AGENDADA', async () => {
      const res = await create(
        salon,
        appointment(salon, {
          clientId: salon.clientIds[1],
          details: [pastSlot(12)],
          createdOfflineAt: minutesFromNow(-14 * 60),
        }),
        salon.workers[0].token,
      );
      expect(res.status).toBe(201);
      expect(await statusOf(sessionIdOf(res.body))).toBe(1);
    });

    it('con el campo POSTERIOR al inicio (se "agendó" ya empezada): 400', async () => {
      const slot = pastSlot(20);
      const res = await create(
        salon,
        appointment(salon, {
          details: [slot],
          createdOfflineAt: new Date(
            new Date(slot.start).getTime() + 30 * 60_000,
          ).toISOString(),
        }),
        salon.workers[0].token,
      );
      expect(res.status).toBe(400);
    });
  });

  describe('validación del campo', () => {
    const tryWith = (createdOfflineAt: unknown) =>
      create(salon, {
        ...appointment(salon, { details: [futureSlot(61, 14)] }),
        createdOfflineAt,
      });

    it('hasta 4 min en el futuro (reloj adelantado): se acepta', async () => {
      const res = await create(
        salon,
        appointment(salon, {
          clientId: salon.clientIds[2],
          details: [futureSlot(62, 14)],
          createdOfflineAt: minutesFromNow(4),
        }),
      );
      expect(res.status).toBe(201);
    });

    it('más de 5 min en el futuro: 400 CREATED_OFFLINE_AT_IN_FUTURE', async () => {
      const res = await tryWith(minutesFromNow(10));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CREATED_OFFLINE_AT_IN_FUTURE');
    });

    it('6 días y 23 h atrás: se acepta; 7 días y 1 h: 400 CREATED_OFFLINE_AT_TOO_OLD', async () => {
      const ok = await create(
        salon,
        appointment(salon, {
          clientId: salon.clientIds[2],
          details: [futureSlot(63, 14)],
          createdOfflineAt: minutesFromNow(-(7 * 24 - 1) * 60),
        }),
      );
      expect(ok.status).toBe(201);
      const old = await tryWith(minutesFromNow(-(7 * 24 + 1) * 60));
      expect(old.status).toBe(400);
      expect(old.body.code).toBe('CREATED_OFFLINE_AT_TOO_OLD');
    });

    it.each([
      '2026-11-19 08:00',
      '2026-11-19T08:00:00',
      '2026-11-19T08:00:00-04:00',
      'ayer',
    ])('formato inválido %p: 400 CREATED_OFFLINE_AT_INVALID', async (v) => {
      const res = await tryWith(v);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CREATED_OFFLINE_AT_INVALID');
    });
  });

  describe('crear cliente', () => {
    const form = (identification: string, createdOfflineAt: string) => {
      const f = new FormData();
      f.append('name', 'Offline');
      f.append('lastName', 'Cliente');
      f.append('identification', identification);
      f.append('createdOfflineAt', createdOfflineAt);
      return f;
    };
    const uniqueId = () => `V${(Date.now() % 90_000_000) + 10_000_000}`;

    it('guarda createdOfflineAt en la ficha', async () => {
      const offlineAt = minutesFromNow(-90);
      const res = await api('POST', '/auth/register/client-by-admin', {
        token: salon.adminToken,
        form: form(uniqueId(), offlineAt),
      });
      expect(res.status).toBe(201);
      const [row] = await q<Array<{ v: Date }>>(
        'SELECT created_offline_at AS v FROM client WHERE id = ?',
        [res.body.clientId],
      );
      expect(
        Math.abs(row.v.getTime() - new Date(offlineAt).getTime()),
      ).toBeLessThan(1000);
    });

    it('campo inválido: 400 y NO crea el cliente (se valida antes de todo)', async () => {
      const id = uniqueId();
      const res = await api('POST', '/auth/register/client-by-admin', {
        token: salon.adminToken,
        form: form(id, minutesFromNow(60)),
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CREATED_OFFLINE_AT_IN_FUTURE');
      const [{ n }] = await q<Array<{ n: number }>>(
        "SELECT COUNT(*) AS n FROM client WHERE REPLACE(identification, '-', '') = ?",
        [id],
      );
      expect(n).toBe(0);
    });
  });

  describe('oferta vencida mientras la cita esperaba en la cola', () => {
    /** Fecha UTC (YYYY-MM-DD) a N días de hoy. */
    const day = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    const offer = async (status: number, start: string, end: string) => {
      const offerId = await insertRow(
        'INSERT INTO offer (name, status, start_date, end_date, company_id) VALUES (?, ?, ?, ?, ?)',
        ['Oferta prueba', status, start, end, salon.companyId],
      );
      await insertRow(
        'INSERT INTO service_offer (service_id, offer_id, price) VALUES (?, ?, 12)',
        [salon.serviceId, offerId],
      );
      return offerId;
    };

    /** Cita a las 00:00 UTC del día `offset` (dentro de las fechas de la oferta). */
    const withOffer = (offerId: number, offset: number, offline?: string) => {
      const start = `${day(offset)}T00:00:00.000Z`;
      const body = appointment(salon, {
        clientId: salon.clientIds[2],
        details: [
          {
            start,
            end: new Date(
              new Date(start).getTime() + 50 * 60_000,
            ).toISOString(),
            worker: 1,
          },
        ],
        createdOfflineAt: offline,
      });
      (body.details as any[])[0].offerId = offerId;
      return body;
    };

    it('vencida por la tarea nocturna (inactiva y fin ya pasado): con el campo se cobra el precio de la oferta', async () => {
      const offerId = await offer(0, day(-5), day(-2));
      const res = await create(
        salon,
        withOffer(offerId, -2, `${day(-3)}T22:00:00.000Z`),
      );
      expect(res.status).toBe(201);
      const [row] = await q<Array<{ cost: string; offer_id: number }>>(
        'SELECT cost, offer_id FROM session_detail WHERE session_id = ?',
        [sessionIdOf(res.body)],
      );
      expect(Number(row.cost)).toBe(12);
      expect(row.offer_id).toBe(offerId);
    });

    it('la misma oferta vencida SIN el campo: 400 (como siempre)', async () => {
      const offerId = await offer(0, day(-5), day(-2));
      const res = await create(salon, withOffer(offerId, -2));
      expect(res.status).toBe(400);
    });

    it('apagada a mano por el dueño (inactiva y aún en fechas): 400 aunque venga el campo', async () => {
      const offerId = await offer(0, day(-5), day(5));
      const res = await create(
        salon,
        withOffer(offerId, -2, `${day(-3)}T22:00:00.000Z`),
      );
      expect(res.status).toBe(400);
    });
  });

  it('con BE-OFF-1: reintento con la misma clave y el mismo createdOfflineAt devuelve la misma cita', async () => {
    const body = appointment(salon, {
      clientId: salon.clientIds[2],
      details: [pastSlot(30)],
      createdOfflineAt: minutesFromNow(-32 * 60),
    });
    const key = newKey();
    const a = await api('POST', CREATE, {
      token: salon.adminToken,
      body,
      headers: { 'Idempotency-Key': key },
    });
    const b = await api('POST', CREATE, {
      token: salon.adminToken,
      body,
      headers: { 'Idempotency-Key': key },
    });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(sessionIdOf(b.body)).toBe(sessionIdOf(a.body));
  });
});
