import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';
import {
  DB,
  REPO_ROOT,
  SERVER_LOG,
  STATE_DIR,
  STATE_FILE,
  appEnv,
  type ItState,
} from './helpers/env';

/**
 * Antes de todas las pruebas de integración:
 *  1. MySQL 8 desechable en Docker (datos en memoria, se borra al terminar),
 *     con el MISMO sql_mode que la base real (ANSI en DigitalOcean) y en UTC.
 *  2. Carga la foto de la estructura (schema/schema.sql) y corre las
 *     migraciones que la foto no tenga.
 *  3. Arranca la app compilada en un proceso aparte (helpers/server.js).
 *
 * Requiere Docker encendido y `npm run build` hecho (el script
 * test:integration ya compila).
 */
const SCHEMA = path.join(__dirname, 'schema', 'schema.sql');

function docker(args: string[], allowFail = false): string {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    if (allowFail) return '';
    throw new Error(
      `docker ${args.join(' ')} falló. ¿Docker está encendido?\n${String(
        (error as { stderr?: string }).stderr ?? error,
      )}`,
    );
  }
}

async function waitForMysql(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const conn = await mysql.createConnection({
        host: DB.host,
        port: DB.port,
        user: DB.user,
        password: DB.password,
        database: DB.database,
      });
      await conn.query('SELECT 1');
      await conn.end();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`MySQL de prueba no respondió: ${String(lastError)}`);
}

function startServer(): Promise<ItState> {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // Carpeta vacía: sin .env, la app solo ve las variables de prueba.
  const cwd = fs.mkdtempSync(path.join(STATE_DIR, 'cwd-'));
  const log = fs.openSync(SERVER_LOG, 'w');
  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'helpers', 'server.js')],
    { cwd, env: appEnv(), stdio: ['ignore', 'pipe', log] },
  );
  const stdout = child.stdout;
  if (!stdout) throw new Error('La app de prueba no expuso su salida.');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`La app no arrancó. Revisa ${SERVER_LOG}`)),
      120_000,
    );
    stdout.on('data', (chunk: Buffer) => {
      fs.appendFileSync(SERVER_LOG, chunk);
      const match = /IT_READY (\d+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        stdout.removeAllListeners('data');
        stdout.on('data', (c: Buffer) => fs.appendFileSync(SERVER_LOG, c));
        resolve({
          apiUrl: `http://127.0.0.1:${match[1]}`,
          serverPid: child.pid as number,
        });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(
        new Error(`La app terminó (código ${code}). Revisa ${SERVER_LOG}`),
      );
    });
  });
}

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const sqlMode = /^-- sql_mode: (.+)$/m.exec(schema)?.[1];
  if (!sqlMode) throw new Error('schema.sql sin la línea "-- sql_mode:"');

  docker(['rm', '-f', DB.container], true);
  docker([
    'run',
    '-d',
    '--name',
    DB.container,
    '-e',
    `MYSQL_ROOT_PASSWORD=${DB.password}`,
    '-e',
    `MYSQL_DATABASE=${DB.database}`,
    '-p',
    `${DB.host}:${DB.port}:3306`,
    '--tmpfs',
    '/var/lib/mysql',
    'mysql:8.0',
    `--sql-mode=${sqlMode}`,
    '--default-time-zone=+00:00',
    '--character-set-server=utf8mb4',
  ]);
  await waitForMysql();

  const conn = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
    database: DB.database,
    multipleStatements: true,
  });
  await conn.query(schema);
  await conn.end();

  // Migraciones que la foto no tenga (las corre igual que el deploy).
  execFileSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'typeorm', 'cli.js'),
      'migration:run',
      '-d',
      path.join(REPO_ROOT, 'dist', 'typeorm-config', 'typeorm.config.js'),
    ],
    {
      cwd: fs.mkdtempSync(path.join(STATE_DIR, 'mig-')),
      env: appEnv(),
      stdio: 'pipe',
    },
  );

  const state = await startServer();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}
