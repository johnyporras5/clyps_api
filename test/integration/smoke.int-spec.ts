import {
  api,
  appointment,
  closeDb,
  futureSlot,
  q,
  seedSalon,
} from './helpers/client';

/** La infraestructura funciona: base de prueba, app y datos sembrados. */
describe('humo: base y app de prueba', () => {
  afterAll(closeDb);

  it('la app usa la base de PRUEBA, no clyps_dev', async () => {
    const [{ db }] = await q<Array<{ db: string }>>('SELECT DATABASE() AS db');
    expect(db).toBe('clyps_it');
  });

  it('la base de prueba corre en UTC y con el modo ANSI de la real', async () => {
    const [row] = await q<Array<{ tz: string; mode: string }>>(
      'SELECT @@global.time_zone AS tz, @@global.sql_mode AS mode',
    );
    expect(row.tz).toBe('+00:00');
    expect(row.mode).toContain('ANSI_QUOTES');
  });

  it('el dueño de un salón sembrado puede crear una cita', async () => {
    const salon = await seedSalon();
    const slot = futureSlot(3, 15);
    const res = await api('POST', '/sessions/create-with-detail', {
      token: salon.adminToken,
      body: appointment(salon, { details: [slot] }),
    });
    expect(res.status).toBe(201);
    expect(res.body.createdDetails).toHaveLength(1);
  });
});
