/**
 * Utilidades de fechas y generación de períodos para el reporte de clientes.
 *
 * Convención de ventanas de negocio (única en todos los endpoints):
 *   - "último mes"  = ACTIVE_WINDOW_DAYS  (30 días móviles)
 *   - "2 meses"     = CHURN_WINDOW_DAYS   (60 días móviles)
 */

export const ACTIVE_WINDOW_DAYS = 30;
export const CHURN_WINDOW_DAYS = 60;

export type Granularity =
  | 'quincenal'
  | 'mensual'
  | 'trimestral'
  | 'semestral'
  | 'anual';

export type Bucket = 'semanal' | 'quincenal' | 'mensual';

/** Granularidades del timeline de ingresos (nombres en inglés, los del front). */
export type TimelineBucket =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'semester'
  | 'year';

export interface ReportPeriod {
  label: string;
  /** Inicio del período (00:00:00.000 local). */
  start: Date;
  /** Fin del período inclusivo (23:59:59.999 local). */
  end: Date;
}

const MONTH_SHORT_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

// Cuántos períodos hacia atrás se generan por cada granularidad.
const GRANULARITY_COUNT: Record<Granularity, number> = {
  quincenal: 12,
  mensual: 12,
  trimestral: 8,
  semestral: 6,
  anual: 5,
};

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Formatea una fecha como "YYYY-MM-DD" usando sus componentes locales. */
export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(y: number, m: number, d: number): Date {
  return new Date(y, m, d, 0, 0, 0, 0);
}

function endOfDay(y: number, m: number, d: number): Date {
  return new Date(y, m, d, 23, 59, 59, 999);
}

/** Último día (número) del mes `m` (0-11) del año `y`. */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function yy(year: number): string {
  return String(year).slice(2);
}

/**
 * Genera los períodos hacia atrás (orden cronológico ascendente) para una
 * granularidad dada, anclados en `now`.
 */
export function generateGranularityPeriods(
  granularity: Granularity,
  now: Date,
): ReportPeriod[] {
  const count = GRANULARITY_COUNT[granularity];
  const periods: ReportPeriod[] = [];

  if (granularity === 'mensual') {
    let y = now.getFullYear();
    let m = now.getMonth();
    for (let i = 0; i < count; i++) {
      periods.push({
        label: MONTH_SHORT_ES[m],
        start: startOfDay(y, m, 1),
        end: endOfDay(y, m, lastDayOfMonth(y, m)),
      });
      m--;
      if (m < 0) {
        m = 11;
        y--;
      }
    }
  } else if (granularity === 'quincenal') {
    let y = now.getFullYear();
    let m = now.getMonth();
    let half = now.getDate() <= 15 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const start = half === 1 ? startOfDay(y, m, 1) : startOfDay(y, m, 16);
      const end =
        half === 1 ? endOfDay(y, m, 15) : endOfDay(y, m, lastDayOfMonth(y, m));
      periods.push({ label: `Q${half} ${MONTH_SHORT_ES[m]}`, start, end });
      if (half === 2) {
        half = 1;
      } else {
        half = 2;
        m--;
        if (m < 0) {
          m = 11;
          y--;
        }
      }
    }
  } else if (granularity === 'trimestral') {
    let y = now.getFullYear();
    let q = Math.floor(now.getMonth() / 3);
    for (let i = 0; i < count; i++) {
      const firstMonth = q * 3;
      periods.push({
        label: `T${q + 1} ${yy(y)}`,
        start: startOfDay(y, firstMonth, 1),
        end: endOfDay(y, firstMonth + 2, lastDayOfMonth(y, firstMonth + 2)),
      });
      q--;
      if (q < 0) {
        q = 3;
        y--;
      }
    }
  } else if (granularity === 'semestral') {
    let y = now.getFullYear();
    let h = now.getMonth() < 6 ? 0 : 1;
    for (let i = 0; i < count; i++) {
      const firstMonth = h * 6;
      periods.push({
        label: `S${h + 1} ${yy(y)}`,
        start: startOfDay(y, firstMonth, 1),
        end: endOfDay(y, firstMonth + 5, lastDayOfMonth(y, firstMonth + 5)),
      });
      h--;
      if (h < 0) {
        h = 1;
        y--;
      }
    }
  } else {
    // anual
    let y = now.getFullYear();
    for (let i = 0; i < count; i++) {
      periods.push({
        label: `${y}`,
        start: startOfDay(y, 0, 1),
        end: endOfDay(y, 11, 31),
      });
      y--;
    }
  }

  return periods.reverse();
}

/**
 * Genera los buckets del timeline (orden cronológico ascendente) que cubren el
 * rango [startDate, endDate] según la granularidad pedida. Cada bucket está
 * alineado al calendario (día/semana/mes/trimestre/semestre/año); el primer y
 * último bucket se recortan a los extremos del rango. Sin etiqueta: el front la
 * formatea desde start/end.
 */
export function generateTimelineBuckets(
  startDate: string,
  endDate: string,
  bucket: TimelineBucket,
): Array<{ start: Date; end: Date }> {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const rangeStart = startOfDay(sy, sm - 1, sd);
  const rangeEnd = endOfDay(ey, em - 1, ed);
  const out: Array<{ start: Date; end: Date }> = [];

  let cur = rangeStart;
  while (cur.getTime() <= rangeEnd.getTime()) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const d = cur.getDate();
    let periodEnd: Date;
    let next: Date;

    if (bucket === 'day') {
      periodEnd = endOfDay(y, m, d);
      next = addDays(startOfDay(y, m, d), 1);
    } else if (bucket === 'week') {
      const e = addDays(startOfDay(y, m, d), 6);
      periodEnd = endOfDay(e.getFullYear(), e.getMonth(), e.getDate());
      next = addDays(startOfDay(y, m, d), 7);
    } else if (bucket === 'month') {
      periodEnd = endOfDay(y, m, lastDayOfMonth(y, m));
      next = startOfDay(y, m + 1, 1);
    } else if (bucket === 'quarter') {
      const fm = Math.floor(m / 3) * 3; // primer mes del trimestre
      periodEnd = endOfDay(y, fm + 2, lastDayOfMonth(y, fm + 2));
      next = startOfDay(y, fm + 3, 1);
    } else if (bucket === 'semester') {
      const fm = m < 6 ? 0 : 6; // primer mes del semestre
      periodEnd = endOfDay(y, fm + 5, lastDayOfMonth(y, fm + 5));
      next = startOfDay(y, fm + 6, 1);
    } else {
      // year
      periodEnd = endOfDay(y, 11, 31);
      next = startOfDay(y + 1, 0, 1);
    }

    out.push({
      start: cur,
      end: periodEnd.getTime() > rangeEnd.getTime() ? rangeEnd : periodEnd,
    });
    cur = next;
  }

  return out;
}

/**
 * Genera los buckets (orden cronológico ascendente) que cubren el rango
 * [startDate, endDate] según el agrupamiento pedido.
 */
export function generateBucketPeriods(
  startDate: string,
  endDate: string,
  bucket: Bucket,
): ReportPeriod[] {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const rangeStart = startOfDay(sy, sm - 1, sd);
  const rangeEnd = endOfDay(ey, em - 1, ed);
  const periods: ReportPeriod[] = [];

  let cur = rangeStart;
  while (cur.getTime() <= rangeEnd.getTime()) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const d = cur.getDate();
    let periodEnd: Date;
    let label: string;
    let next: Date;

    if (bucket === 'semanal') {
      const end = addDays(startOfDay(y, m, d), 6);
      periodEnd = endOfDay(end.getFullYear(), end.getMonth(), end.getDate());
      label = `${d} ${MONTH_SHORT_ES[m]}`;
      next = addDays(startOfDay(y, m, d), 7);
    } else if (bucket === 'quincenal') {
      const half = d <= 15 ? 1 : 2;
      const lastDay = half === 1 ? 15 : lastDayOfMonth(y, m);
      periodEnd = endOfDay(y, m, lastDay);
      label = `Q${half} ${MONTH_SHORT_ES[m]}`;
      next = startOfDay(y, m, lastDay + 1);
    } else {
      // mensual
      const lastDay = lastDayOfMonth(y, m);
      periodEnd = endOfDay(y, m, lastDay);
      label = MONTH_SHORT_ES[m];
      next = startOfDay(y, m + 1, 1);
    }

    periods.push({
      label,
      start: cur,
      // El bucket no se extiende más allá del fin del rango pedido.
      end: periodEnd.getTime() > rangeEnd.getTime() ? rangeEnd : periodEnd,
    });
    cur = next;
  }

  return periods;
}
