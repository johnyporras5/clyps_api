import {
  api,
  appointment,
  closeDb,
  futureSlot,
  insertRow,
  q,
  seedSalon,
  type Salon,
} from './helpers/client';

/**
 * BE-OFF-4 contra MySQL real: `?since=` en los catálogos. `updated_at` lo pone
 * MySQL (ON UPDATE), los borrados de verdad se anotan en catalog_deletion.
 */

const SERVICES = '/services/my-company';
const WORKERS = '/company-workers/my-company/workers';
const CLIENTS = '/clients/admin/companies';
const MY_SERVICES = '/sessions/worker/my-services';
const MY_CLIENTS = '/sessions/worker/my-clients';

/**
 * Deja todo lo del salón como "cambiado hace 2 horas". Un UPDATE que fija
 * updated_at a mano no dispara el ON UPDATE, así que queda ese valor.
 */
async function ageSalon(s: Salon): Promise<void> {
  const old = 'UTC_TIMESTAMP(6) - INTERVAL 2 HOUR';
  await q(`UPDATE service SET updated_at = ${old} WHERE company_id = ?`, [
    s.companyId,
  ]);
  await q(
    `UPDATE company_worker SET updated_at = ${old} WHERE company_id = ?`,
    [s.companyId],
  );
  await q(
    `UPDATE worker SET updated_at = ${old} WHERE id IN (SELECT worker_id FROM company_worker WHERE company_id = ?)`,
    [s.companyId],
  );
  await q(`UPDATE client SET updated_at = ${old} WHERE id IN (?)`, [
    s.clientIds,
  ]);
  await q(`UPDATE \`user\` SET updated_at = ${old} WHERE id IN (?)`, [
    [s.adminUserId, ...s.workers.map((w) => w.userId)],
  ]);
  await q(`UPDATE session SET updated_at = ${old} WHERE client_id IN (?)`, [
    s.clientIds,
  ]);
  await q(
    `UPDATE session_detail SET updated_at = ${old} WHERE company_worker_id IN (?)`,
    [s.workers.map((w) => w.companyWorkerId)],
  );
}

/** Hace 1 hora, en ISO UTC: después de "envejecer", nada cambió desde aquí. */
const oneHourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

const get = (path: string, token: string, since?: string, extra = '') =>
  api(
    'GET',
    `${path}?limit=100${since ? `&since=${encodeURIComponent(since)}` : ''}${extra}`,
    { token },
  );

describe('BE-OFF-4 ?since= (MySQL real)', () => {
  afterAll(closeDb);

  describe('serverTime y compatibilidad', () => {
    let salon: Salon;
    beforeAll(async () => {
      salon = await seedSalon();
    });

    it.each([SERVICES, WORKERS, CLIENTS])(
      '%s sin since: misma respuesta de siempre + serverTime (sin deleted ni deletedIds)',
      async (path) => {
        const res = await get(path, salon.adminToken);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual([
          'data',
          'meta',
          'serverTime',
        ]);
        for (const row of res.body.data)
          expect(row).not.toHaveProperty('deleted');
      },
    );

    it('serverTime sale del reloj de la BASE en UTC, 60 s atrás', async () => {
      const res = await get(SERVICES, salon.adminToken);
      const [{ now }] = await q<Array<{ now: string }>>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ') AS now",
      );
      const dbNow = new Date(now.replace(/(\.\d{3})\d+Z$/, '$1Z')).getTime();
      const server = new Date(res.body.serverTime).getTime();
      expect(res.body.serverTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(dbNow - server).toBeGreaterThanOrEqual(55_000);
      expect(dbNow - server).toBeLessThanOrEqual(65_000);
    });

    it.each([SERVICES, WORKERS, CLIENTS])(
      '%s: since inválido → 400 SINCE_INVALID',
      async (path) => {
        const res = await get(path, salon.adminToken, '2026-11-19 12:00');
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('SINCE_INVALID');
      },
    );

    it.each([
      [MY_SERVICES, 'my-services'],
      [MY_CLIENTS, 'my-clients'],
    ])('%s (trabajadora): since inválido → 400', async (path) => {
      const res = await get(path, salon.workers[0].token, 'ayer');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SINCE_INVALID');
    });

    it('since de hace 100 días: trae TODO con fullSync: true', async () => {
      const all = await get(CLIENTS, salon.adminToken);
      const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
      const res = await get(CLIENTS, salon.adminToken, old);
      expect(res.body.fullSync).toBe(true);
      expect(res.body.meta.total).toBe(all.body.meta.total);
    });
  });

  describe('servicios', () => {
    let salon: Salon;
    let other: Salon;
    let since: string;
    beforeAll(async () => {
      salon = await seedSalon();
      other = await seedSalon();
      await ageSalon(salon);
      await ageSalon(other);
      since = oneHourAgo();
    });

    it('sin cambios: 0 filas y deletedIds vacío', async () => {
      const res = await get(SERVICES, salon.adminToken, since);
      expect(res.body.meta.total).toBe(0);
      expect(res.body.deletedIds).toEqual([]);
    });

    it('cambio de precio POR TRABAJADORA (dentro del JSON): el servicio aparece', async () => {
      await q(
        "UPDATE service SET workers = JSON_SET(workers, '$[0].cost', 35) WHERE id = ?",
        [salon.serviceId],
      );
      const res = await get(SERVICES, salon.adminToken, since);
      expect(res.body.data.map((s: any) => s.id)).toContain(salon.serviceId);
    });

    it('inactivar por la API: aparece con status 0', async () => {
      const extra = (
        await q<Array<{ id: number }>>(
          "SELECT id FROM service WHERE company_id = ? AND name LIKE 'Corte%'",
          [other.companyId],
        )
      )[0].id;
      const off = await api('PATCH', `${SERVICES}/${extra}/inactive`, {
        token: other.adminToken,
      });
      expect(off.status).toBe(200);
      const res = await get(SERVICES, other.adminToken, since);
      const row = res.body.data.find((s: any) => s.id === extra);
      expect(row?.status).toBe(0);
    });

    it('borrar de verdad por la API: viene en deletedIds y no en data', async () => {
      const [{ id }] = await q<Array<{ id: number }>>(
        "SELECT id FROM service WHERE company_id = ? AND name LIKE 'Corte%'",
        [salon.companyId],
      );
      // Uno nuevo sin citas (los que tienen citas no se pueden borrar).
      const tempId = await insertRow(
        "INSERT INTO service (name, cost, standard_time, company_id, workers, status) VALUES ('Desechable', 1, 10, ?, '[]', 1)",
        [salon.companyId],
      );
      expect(tempId).not.toBe(id);

      const del = await api('DELETE', `${SERVICES}/${tempId}`, {
        token: salon.adminToken,
      });
      expect([200, 204]).toContain(del.status);

      const res = await get(SERVICES, salon.adminToken, since);
      expect(res.body.deletedIds).toContain(tempId);
      expect(res.body.data.map((s: any) => s.id)).not.toContain(tempId);
    });

    it('aislamiento: los cambios y borrados de OTRO salón no aparecen', async () => {
      const mine = await get(SERVICES, salon.adminToken, since);
      const otherIds = (
        await q<Array<{ id: number }>>(
          'SELECT id FROM service WHERE company_id = ?',
          [other.companyId],
        )
      ).map((r) => r.id);
      for (const s of mine.body.data) expect(otherIds).not.toContain(s.id);
      const theirs = await get(SERVICES, other.adminToken, since);
      for (const deleted of mine.body.deletedIds) {
        expect(theirs.body.deletedIds).not.toContain(deleted);
      }
    });
  });

  describe('trabajadores', () => {
    let salon: Salon;
    let since: string;
    beforeAll(async () => {
      salon = await seedSalon();
      await ageSalon(salon);
      since = oneHourAgo();
    });

    it('sin cambios: 0 filas', async () => {
      const res = await get(WORKERS, salon.adminToken, since);
      expect(res.body.meta.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('cambio de nombre (tabla worker): aparece con deleted: false', async () => {
      await q("UPDATE worker SET name = CONCAT(name, ' X') WHERE id = ?", [
        salon.workers[0].workerId,
      ]);
      const res = await get(WORKERS, salon.adminToken, since);
      const row = res.body.data.find(
        (w: any) => w.companyWorkerId === salon.workers[0].companyWorkerId,
      );
      expect(row?.fullName).toMatch(/ X$/);
      expect(row?.deleted).toBe(false);
    });

    it('cambio de correo de su cuenta (tabla user): aparece', async () => {
      await q("UPDATE `user` SET email = CONCAT('n-', email) WHERE id = ?", [
        salon.workers[1].userId,
      ]);
      const res = await get(WORKERS, salon.adminToken, since);
      expect(res.body.data.map((w: any) => w.companyWorkerId)).toContain(
        salon.workers[1].companyWorkerId,
      );
    });

    it('quitada del salón (borrado suave): aparece con deleted: true', async () => {
      await q(
        'UPDATE company_worker SET temporarily_deleted = 1 WHERE id = ?',
        [salon.workers[1].companyWorkerId],
      );
      const res = await get(WORKERS, salon.adminToken, since);
      const row = res.body.data.find(
        (w: any) => w.companyWorkerId === salon.workers[1].companyWorkerId,
      );
      expect(row?.deleted).toBe(true);
      // El conteo coincide con lo que viene.
      expect(res.body.meta.total).toBe(res.body.data.length);
    });

    it('quitada de verdad por la API (fila borrada): viene en deletedIds', async () => {
      const del = await api(
        'DELETE',
        `/company-workers/worker/${salon.workers[0].workerId}`,
        { token: salon.adminToken },
      );
      expect(del.status).toBe(200);
      const res = await get(WORKERS, salon.adminToken, since);
      expect(res.body.deletedIds).toContain(salon.workers[0].companyWorkerId);
      const [{ n }] = await q<Array<{ n: number }>>(
        "SELECT COUNT(*) AS n FROM catalog_deletion WHERE entity = 'company_worker' AND entity_id = ? AND company_id = ?",
        [salon.workers[0].companyWorkerId, salon.companyId],
      );
      expect(n).toBe(1);
    });
  });

  describe('clientes', () => {
    let salon: Salon;
    let other: Salon;
    let since: string;
    beforeAll(async () => {
      salon = await seedSalon();
      other = await seedSalon();
      await ageSalon(salon);
      await ageSalon(other);
      since = oneHourAgo();
    });

    it('sin cambios: 0 filas', async () => {
      const res = await get(CLIENTS, salon.adminToken, since);
      expect(res.body.meta.total).toBe(0);
    });

    it('cambio en la ficha: aparece; el de otro salón no', async () => {
      await q("UPDATE client SET phone = '04140000000' WHERE id IN (?)", [
        [salon.clientIds[0], other.clientIds[0]],
      ]);
      const res = await get(CLIENTS, salon.adminToken, since);
      const ids = res.body.data.map((c: any) => c.id);
      expect(ids).toContain(salon.clientIds[0]);
      expect(ids).not.toContain(other.clientIds[0]);
    });

    it('eliminado del salón por la API: aparece con deleted: true', async () => {
      const del = await api('DELETE', `/clients/admin/${salon.clientIds[1]}`, {
        token: salon.adminToken,
      });
      expect(del.status).toBe(200);
      const res = await get(CLIENTS, salon.adminToken, since);
      const row = res.body.data.find((c: any) => c.id === salon.clientIds[1]);
      expect(row?.deleted).toBe(true);
    });

    it('una cita nueva (cambia su última cita): aparece', async () => {
      const appt = await api('POST', '/sessions/create-with-detail', {
        token: salon.adminToken,
        body: appointment(salon, {
          clientId: salon.clientIds[2],
          details: [futureSlot(70, 14)],
        }),
      });
      expect(appt.status).toBe(201);
      const res = await get(CLIENTS, salon.adminToken, since);
      const row = res.body.data.find((c: any) => c.id === salon.clientIds[2]);
      expect(row?.deleted).toBe(false);
    });

    it('paginado con since: el total es de lo cambiado y las páginas lo cubren todo', async () => {
      const res1 = await api(
        'GET',
        `${CLIENTS}?limit=2&page=1&since=${encodeURIComponent(since)}`,
        { token: salon.adminToken },
      );
      const res2 = await api(
        'GET',
        `${CLIENTS}?limit=2&page=2&since=${encodeURIComponent(since)}`,
        { token: salon.adminToken },
      );
      expect(res1.body.meta.total).toBe(3);
      const ids = [...res1.body.data, ...res2.body.data].map((c: any) => c.id);
      expect(new Set(ids)).toEqual(new Set(salon.clientIds));
    });

    it('margen de 60 s: un cambio hecho justo antes de sincronizar vuelve a venir en la siguiente', async () => {
      await q("UPDATE client SET phone = '04141111111' WHERE id = ?", [
        salon.clientIds[0],
      ]);
      const first = await get(CLIENTS, salon.adminToken, since);
      const next = await get(CLIENTS, salon.adminToken, first.body.serverTime);
      expect(next.body.data.map((c: any) => c.id)).toContain(
        salon.clientIds[0],
      );
    });
  });

  describe('listas de la trabajadora', () => {
    let salon: Salon;
    let since: string;
    beforeAll(async () => {
      salon = await seedSalon();
      await ageSalon(salon);
      since = oneHourAgo();
    });

    it('sin cambios: 0 filas en las dos listas', async () => {
      const s = await get(MY_SERVICES, salon.workers[0].token, since);
      const c = await get(MY_CLIENTS, salon.workers[0].token, since);
      expect([s.status, c.status]).toEqual([200, 200]);
      expect(s.body.meta.total).toBe(0);
      expect(c.body.meta.total).toBe(0);
      expect(s.body.serverTime).toBeDefined();
    });

    it('una cita suya nueva: aparecen el servicio (estadísticas) y la clienta; para la OTRA trabajadora no', async () => {
      const appt = await api('POST', '/sessions/create-with-detail', {
        token: salon.adminToken,
        body: appointment(salon, {
          clientId: salon.clientIds[1],
          details: [futureSlot(71, 14)],
        }),
      });
      expect(appt.status).toBe(201);

      const mine = await get(MY_SERVICES, salon.workers[0].token, since);
      const row = mine.body.data.find(
        (s: any) => s.serviceId === salon.serviceId,
      );
      expect(row?.totalAppointments).toBe(1);
      expect(row?.deleted).toBe(false);

      const myClients = await get(MY_CLIENTS, salon.workers[0].token, since);
      expect(myClients.body.data.map((c: any) => c.id)).toEqual([
        salon.clientIds[1],
      ]);

      const theirClients = await get(MY_CLIENTS, salon.workers[1].token, since);
      expect(theirClients.body.data).toEqual([]);
    });

    it('le quitan el servicio: le llega con deleted: true', async () => {
      await q(
        "UPDATE service SET workers = JSON_REMOVE(workers, '$[1]') WHERE id = ?",
        [salon.serviceId],
      );
      const res = await get(MY_SERVICES, salon.workers[1].token, since);
      const row = res.body.data.find(
        (s: any) => s.serviceId === salon.serviceId,
      );
      expect(row?.deleted).toBe(true);
    });
  });
});
