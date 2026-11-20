/* eslint-disable */
/**
 * Regenera test/integration/schema/schema.sql: la ESTRUCTURA de la base (sin
 * datos) que cargan las pruebas de integración antes de correr las migraciones
 * nuevas.
 *
 * Hace falta porque las migraciones no arman la base desde cero: la primera
 * (1766087155639-AddColumnUser) ya supone tablas existentes.
 *
 * Solo LEE: `SHOW CREATE TABLE` de cada tabla y los nombres de la tabla
 * `migrations`. No copia ninguna fila de datos (nada personal entra al repo).
 *
 * Uso: npm run test:integration:schema   (lee la base del .env)
 *
 * Cuándo correrlo: no hace falta en cada migración nueva (las pruebas corren
 * las pendientes encima de la foto). Solo si la foto queda tan vieja que una
 * migración no aplica, o para que las pruebas arranquen más rápido.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl:
      Number(process.env.DB_PORT) === 25060 || process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const [tables] = await conn.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
  );

  // El modo SQL de la base real (en DigitalOcean es ANSI: comillas dobles
  // para nombres, `||` para concatenar…). Las pruebas arrancan MySQL con este
  // mismo modo para que el SQL se comporte igual que en dev/producción.
  const [[{ mode }]] = await conn.query('SELECT @@global.sql_mode AS mode');

  const out = [
    '-- Estructura generada por test/integration/schema/refresh-schema.js.',
    '-- NO editar a mano. Sin datos: solo tablas y el historial de migraciones.',
    `-- Generada: ${new Date().toISOString()}`,
    `-- sql_mode: ${mode}`,
    `SET SESSION sql_mode = '${mode}';`,
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  for (const { name } of tables) {
    const [[row]] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
    const ddl = row['Create Table'].replace(/ AUTO_INCREMENT=\d+/, '');
    out.push(`${ddl};`, '');
  }

  // Solo el historial de migraciones: así `migration:run` aplica nada más
  // las que la foto no tiene.
  const [migrations] = await conn.query(
    'SELECT timestamp, name FROM migrations ORDER BY id',
  );
  for (const m of migrations) {
    out.push(
      `INSERT INTO migrations (timestamp, name) VALUES (${Number(m.timestamp)}, ${conn.escape(m.name)});`,
    );
  }
  out.push('', 'SET FOREIGN_KEY_CHECKS = 1;', '');

  const file = path.join(__dirname, 'schema.sql');
  fs.writeFileSync(file, out.join('\n'));
  console.log(
    `schema.sql: ${tables.length} tablas, ${migrations.length} migraciones.`,
  );
  await conn.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
