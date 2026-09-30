/**
 * Horario abierto para la reserva pública. Replica en el servidor la regla que
 * el front usa para generar los slots del cliente (`resolveOpenIntervals` en
 * clyps-mobile/src/utils/appointmentSlots.ts):
 *
 *   - Si el trabajador tiene horario propio (define días), manda el suyo, aunque
 *     ese día no trabaje (el cliente no cae al horario del local).
 *   - Si no, se usa el horario de la empresa.
 *   - Las excepciones por fecha cierran el día (`non-working-day`) o lo abren
 *     con un horario especial (`custom-schedule`).
 *
 * En la app del cliente esto solo lo valida el front; en el enlace público
 * cualquiera puede llamar al endpoint, así que se valida también aquí.
 */
import {
  BUSINESS_TIMEZONE,
  businessDateOf,
} from '../common/utils/business-time.util';
import { normalizeCompanyCalendarDetail } from '../common/utils/company-calendar.util';

interface TimeSlot {
  hour: number;
  minute: number;
  period?: 'AM' | 'PM' | string;
}

interface Period {
  start: TimeSlot;
  end: TimeSlot;
}

interface Schedule {
  days?: string[];
  morning?: Period | null;
  afternoon?: Period | null;
}

interface Exception {
  date?: string;
  type?: string;
  customSchedule?: { morning?: Period | null; afternoon?: Period | null };
  morning?: Period | null;
  afternoon?: Period | null;
}

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function slotToMinutes(t: TimeSlot | undefined | null): number | null {
  if (!t || typeof t.hour !== 'number') return null;
  let h = t.hour;
  if (t.period === 'PM' && h !== 12) h += 12;
  if (t.period === 'AM' && h === 12) h = 0;
  return h * 60 + (Number(t.minute) || 0);
}

function periodsToIntervals(
  periods: Array<Period | null | undefined>,
): [number, number][] {
  const intervals: [number, number][] = [];
  for (const p of periods) {
    if (!p) continue;
    const start = slotToMinutes(p.start);
    const end = slotToMinutes(p.end);
    if (start !== null && end !== null && start < end) {
      intervals.push([start, end]);
    }
  }
  return intervals;
}

function scheduleToIntervals(
  schedule: Schedule,
  dateStr: string,
  exceptions: Exception[],
): [number, number][] {
  const exception = exceptions.find((e) => e?.date === dateStr);
  if (exception?.type === 'non-working-day') return [];
  if (exception?.type === 'custom-schedule') {
    const custom = exception.customSchedule ?? {
      morning: exception.morning,
      afternoon: exception.afternoon,
    };
    return periodsToIntervals([custom.morning, custom.afternoon]);
  }

  const dayKey = DAY_KEYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
  if (!Array.isArray(schedule.days) || !schedule.days.includes(dayKey)) {
    return [];
  }
  return periodsToIntervals([schedule.morning, schedule.afternoon]);
}

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Minutos desde medianoche de un instante en la zona del negocio. */
function businessMinutesOf(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** Une intervalos que se tocan (mañana 9-12 + tarde 12-6 → 9-6). */
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * ¿El rango [start, start + durationMinutes] cae dentro del horario abierto
 * (del trabajador o, si no tiene, de la empresa) de ese día?
 */
export function isWithinOpenHours(params: {
  start: Date;
  durationMinutes: number;
  companyCalendarDetail: unknown;
  workerCalendar: unknown;
}): boolean {
  const { start, durationMinutes } = params;
  const dateStr = businessDateOf(start);
  const startMin = businessMinutesOf(start);
  const endMin = startMin + Math.max(0, durationMinutes);

  let intervals: [number, number][] = [];
  const worker = parseJson(params.workerCalendar) as
    | (Schedule & { exceptions?: Exception[] })
    | null;

  if (worker && Array.isArray(worker.days) && worker.days.length > 0) {
    intervals = scheduleToIntervals(
      worker,
      dateStr,
      Array.isArray(worker.exceptions) ? worker.exceptions : [],
    );
  } else {
    const company = normalizeCompanyCalendarDetail(
      params.companyCalendarDetail,
    );
    if (!company?.schedule) return false;
    intervals = scheduleToIntervals(
      company.schedule as Schedule,
      dateStr,
      company.exceptions as Exception[],
    );
  }

  return mergeIntervals(intervals).some(
    ([open, close]) => startMin >= open && endMin <= close,
  );
}
