import {
  BUSINESS_TIMEZONE,
  businessDateOf,
  businessDayStart,
  businessDayBounds,
} from '../common/utils/business-time.util';
import type { PayrollFrequency } from './payroll.enums';

// Límites del periodo (PAY-2). Todo se razona en la fecha de calendario de la
// ZONA DEL NEGOCIO y se devuelve como instantes UTC (inicio 00:00, fin 23:59:59.999).

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (dateStr: string): [number, number, number] =>
  dateStr.split('-').map(Number) as [number, number, number];

// Último día del mes m (1-based) del año y.
const lastDayOfMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Ciclo de calendario completo que contiene `date`, según la frecuencia.
 * Quincenal: 1–15 o 16–fin. Semanal: lunes–domingo. Mensual: 1–fin.
 */
export function calendarBoundsFor(
  frequency: PayrollFrequency,
  date: Date,
  tz: string = BUSINESS_TIMEZONE,
): { startsAt: Date; endsAt: Date } {
  const [y, m, d] = ymd(businessDateOf(date, tz));

  let startStr: string;
  let endStr: string;

  if (frequency === 'quincenal') {
    if (d <= 15) {
      startStr = `${y}-${pad(m)}-01`;
      endStr = `${y}-${pad(m)}-15`;
    } else {
      startStr = `${y}-${pad(m)}-16`;
      endStr = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
    }
  } else if (frequency === 'mensual') {
    startStr = `${y}-${pad(m)}-01`;
    endStr = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
  } else {
    // semanal: lunes–domingo que contiene la fecha (getUTCDay: 0=dom..6=sáb).
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const toMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(Date.UTC(y, m - 1, d - toMonday));
    const sunday = new Date(Date.UTC(y, m - 1, d - toMonday + 6));
    startStr = monday.toISOString().slice(0, 10);
    endStr = sunday.toISOString().slice(0, 10);
  }

  return {
    startsAt: businessDayStart(startStr, tz),
    endsAt: businessDayBounds(endStr, tz).endOfDay,
  };
}

/**
 * Límites del PRIMER periodo (bootstrap). Igual al ciclo, pero si el alta cae a
 * mitad de ciclo, el inicio se recorta al día de alta (día 9 quincenal → 9–15),
 * para quedar alineado con el calendario en adelante.
 */
export function firstPeriodBoundsFor(
  frequency: PayrollFrequency,
  signupDate: Date,
  tz: string = BUSINESS_TIMEZONE,
): { startsAt: Date; endsAt: Date } {
  const cycle = calendarBoundsFor(frequency, signupDate, tz);
  const signupDayStart = businessDayStart(businessDateOf(signupDate, tz), tz);
  return {
    startsAt: signupDayStart > cycle.startsAt ? signupDayStart : cycle.startsAt,
    endsAt: cycle.endsAt,
  };
}

/** Etiqueta legible del periodo: "16–31 mayo 2026" o "28 abr – 4 may 2026". */
export function periodLabel(
  startsAt: Date,
  endsAt: Date,
  tz: string = BUSINESS_TIMEZONE,
): string {
  const [sy, sm, sd] = ymd(businessDateOf(startsAt, tz));
  const [ey, em, ed] = ymd(businessDateOf(endsAt, tz));
  if (sy === ey && sm === em) {
    return `${sd}–${ed} ${MONTHS_ES[sm - 1]} ${sy}`;
  }
  const left = `${sd} ${MONTHS_ES[sm - 1].slice(0, 3)}`;
  const right = `${ed} ${MONTHS_ES[em - 1].slice(0, 3)} ${ey}`;
  return `${left} – ${right}`;
}
