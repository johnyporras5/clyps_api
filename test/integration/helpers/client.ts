import * as fs from 'fs';
import * as mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { DB, JWT_SECRET, STATE_FILE, type ItState } from './env';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken') as {
  sign: (payload: object, secret: string, opts: object) => string;
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

const rand255 = () => Math.floor(Math.random() * 255);

function state(): ItState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as ItState;
}

export interface ApiResponse<T = any> {
  status: number;
  headers: Headers;
  body: T;
}

export async function api<T = any>(
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: unknown;
    form?: FormData;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    // Una IP distinta por petición (ver helpers/server.js: trust proxy).
    'X-Forwarded-For': `10.${rand255()}.${rand255()}.${rand255()}`,
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${state().apiUrl}${path}`, {
    method,
    headers,
    body,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* texto plano */
  }
  return { status: res.status, headers: res.headers, body: parsed as T };
}

/* ------------------------------------------------------------------ */
/* Base de datos (la de PRUEBA)                                        */
/* ------------------------------------------------------------------ */

let pool: mysql.Pool | null = null;

/**
 * Conexión a la base de prueba. `timezone: 'Z'`: las fechas se leen y se
 * escriben en UTC, igual que la app de prueba (TZ=UTC) y que MySQL.
 */
export function db(): mysql.Pool {
  pool ??= mysql.createPool({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
    database: DB.database,
    timezone: 'Z',
    connectionLimit: 5,
  });
  return pool;
}

export async function q<T = any>(sql: string, params: unknown[] = []) {
  const [rows] = await db().query(sql, params);
  return rows as T;
}

/** INSERT y devuelve el id nuevo. */
export async function insertRow(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const [res] = await db().query(sql, params);
  return (res as mysql.ResultSetHeader).insertId;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/* ------------------------------------------------------------------ */
/* Tokens (firmados con el secreto de PRUEBA, como los de la app)       */
/* ------------------------------------------------------------------ */

export function token(payload: {
  sub: number;
  email: string;
  userType: 'adm' | 'wrk' | 'cli';
  companyId: number | null;
  companyWorkerId: number | null;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/* ------------------------------------------------------------------ */
/* Datos de prueba                                                      */
/* ------------------------------------------------------------------ */

export interface Salon {
  companyId: number;
  adminUserId: number;
  adminToken: string;
  /** Dos trabajadoras: A y B. */
  workers: Array<{
    userId: number;
    workerId: number;
    companyWorkerId: number;
    token: string;
  }>;
  /** Servicio de 50 min que hacen las dos trabajadoras. */
  serviceId: number;
  /** Tres clientes del salón. */
  clientIds: number[];
}

let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Un salón nuevo y aislado (cada prueba siembra el suyo): dueño, dos
 * trabajadoras, un servicio y tres clientes. Plan Full exento y onboarding
 * terminado, para que nada bloquee crear citas. Correos @example.test: nunca
 * existen.
 */
export async function seedSalon(
  opts: { allowPastAppointments?: boolean } = {},
): Promise<Salon> {
  const tag = unique();

  const insert = async (sql: string, params: unknown[]) => {
    const [res] = await db().query(sql, params);
    return (res as mysql.ResultSetHeader).insertId;
  };

  const adminEmail = `owner-${tag}@example.test`;
  const adminUserId = await insert(
    "INSERT INTO `user` (username, email, password, user_type, email_verified) VALUES (?, ?, 'x', 'adm', 1)",
    [`owner_${tag}`, adminEmail],
  );
  const companyId = await insert(
    'INSERT INTO company (name, email, user_id, slug, allow_past_appointments) VALUES (?, ?, ?, ?, ?)',
    [
      `Salon ${tag}`,
      adminEmail,
      adminUserId,
      `salon-${tag}`,
      opts.allowPastAppointments ? 1 : 0,
    ],
  );
  await insert(
    "INSERT INTO subscription (company_id, plan_id, status, billing_exempt, trial_ends_at, current_period_end) VALUES (?, 'full', 'active', 1, UTC_TIMESTAMP() - INTERVAL 30 DAY, UTC_TIMESTAMP() + INTERVAL 30 DAY)",
    [companyId],
  );
  await insert(
    "INSERT INTO onboarding_state (company_id, global_status, steps) VALUES (?, 'completed', '{}')",
    [companyId],
  );

  const workers: Salon['workers'] = [];
  for (const letter of ['a', 'b']) {
    const email = `worker-${letter}-${tag}@example.test`;
    const userId = await insert(
      "INSERT INTO `user` (username, email, password, user_type, email_verified) VALUES (?, ?, 'x', 'wrk', 1)",
      [`worker_${letter}_${tag}`, email],
    );
    const workerId = await insert(
      'INSERT INTO worker (name, user_id, is_active) VALUES (?, ?, 1)',
      [`Trabajadora ${letter.toUpperCase()} ${tag}`, userId],
    );
    const companyWorkerId = await insert(
      'INSERT INTO company_worker (worker_id, company_id, user_id, is_active, slug) VALUES (?, ?, ?, 1, ?)',
      [workerId, companyId, userId, `w-${letter}-${tag}`],
    );
    workers.push({
      userId,
      workerId,
      companyWorkerId,
      token: token({
        sub: userId,
        email,
        userType: 'wrk',
        companyId,
        companyWorkerId,
      }),
    });
  }

  const serviceId = await insert(
    'INSERT INTO service (name, cost, standard_time, company_id, workers, status, percentage) VALUES (?, 20, 50, ?, ?, 1, 50)',
    [
      `Corte ${tag}`,
      companyId,
      JSON.stringify(
        workers.map((w) => ({
          id: w.companyWorkerId,
          cost: 20,
          time: 50,
          percentage: 50,
        })),
      ),
    ],
  );

  const clientIds: number[] = [];
  for (let i = 1; i <= 3; i++) {
    clientIds.push(
      await insert(
        'INSERT INTO client (name, last_name, is_active, companies) VALUES (?, ?, 1, ?)',
        [`Cliente${i}`, tag, JSON.stringify([companyId])],
      ),
    );
  }

  return {
    companyId,
    adminUserId,
    adminToken: token({
      sub: adminUserId,
      email: adminEmail,
      userType: 'adm',
      companyId,
      companyWorkerId: null,
    }),
    workers,
    serviceId,
    clientIds,
  };
}

/* ------------------------------------------------------------------ */
/* Fechas                                                               */
/* ------------------------------------------------------------------ */

/** Un instante a N minutos de ahora, en ISO UTC con Z. */
export const minutesFromNow = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

/** Día futuro fijo a una hora UTC (para no chocar entre pruebas). */
export function futureSlot(daysAhead: number, hourUtc: number, minutes = 50) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysAhead);
  start.setUTCHours(hourUtc, 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Body de POST /sessions/create-with-detail con un servicio por tramo. */
export function appointment(
  salon: Salon,
  opts: {
    clientId?: number;
    details: Array<{ worker?: number; start: string; end: string }>;
    createdOfflineAt?: string;
  },
): Record<string, unknown> {
  const first = opts.details[0];
  return {
    clientId: opts.clientId ?? salon.clientIds[0],
    startDatetime: first.start,
    sessionDatetime: first.start,
    ...(opts.createdOfflineAt !== undefined
      ? { createdOfflineAt: opts.createdOfflineAt }
      : {}),
    details: opts.details.map((d) => ({
      serviceId: salon.serviceId,
      companyWorkerId: salon.workers[d.worker ?? 0].companyWorkerId,
      detailStartDatetime: d.start,
      detailEndDatetime: d.end,
    })),
  };
}

export const newKey = (): string => randomUUID();
