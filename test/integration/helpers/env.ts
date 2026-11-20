import * as os from 'os';
import * as path from 'path';

/**
 * Configuración de las pruebas de integración (base y app de PRUEBA).
 *
 * Nada aquí apunta a clyps_dev ni a producción: MySQL corre en un contenedor
 * Docker desechable en 127.0.0.1 y la app se arranca en un proceso aparte,
 * desde una carpeta vacía (sin `.env`), con solo estas variables.
 */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export const DB = {
  container: process.env.IT_DB_CONTAINER ?? 'clyps-it-mysql',
  host: '127.0.0.1',
  port: Number(process.env.IT_DB_PORT ?? 3399),
  user: 'root',
  password: 'it-pass',
  database: 'clyps_it',
};

export const JWT_SECRET = 'clyps-integration-tests-only';

/** Donde se guardan el puerto de la app, el pid y el log entre setup y pruebas. */
export const STATE_DIR = path.join(os.tmpdir(), 'clyps-integration');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');
export const SERVER_LOG = path.join(STATE_DIR, 'server.log');

export interface ItState {
  apiUrl: string;
  serverPid: number;
}

/**
 * Variables de la app de prueba. Todo lo que habla con el mundo (correo,
 * push, pagos, archivos, IA) va VACÍO: esos servicios se apagan solos sin
 * clave. La zona horaria es UTC, como el servidor desplegado.
 */
export function appEnv(): NodeJS.ProcessEnv {
  const keep = [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'windir',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ComSpec',
  ];
  const base: NodeJS.ProcessEnv = {};
  for (const key of keep) {
    if (process.env[key] !== undefined) base[key] = process.env[key];
  }
  return {
    ...base,
    TZ: 'UTC',
    NODE_ENV: 'test',
    IT_REPO_ROOT: REPO_ROOT,
    DB_HOST: DB.host,
    DB_PORT: String(DB.port),
    DB_USERNAME: DB.user,
    DB_PASSWORD: DB.password,
    DB_DATABASE: DB.database,
    JWT_SECRET,
    JWT_EXPIRES_IN: '1h',
    // Apagados a propósito: sin clave no sale nada hacia afuera.
    RESEND_API_KEY: '',
    FIREBASE_CREDENTIALS_BASE64: '',
    OPENAI_API_KEY: '',
    PAYPAL_CLIENT_ID: '',
    PAYPAL_CLIENT_SECRET: '',
    BINANCE_API_KEY: '',
    BINANCE_API_SECRET: '',
    COBRIX_API_KEY: '',
    DO_SPACES_ACCESS_KEY: '',
    DO_SPACES_SECRET_KEY: '',
    LEGACY_IDENTITY_COMPANY_IDS: '',
  };
}
