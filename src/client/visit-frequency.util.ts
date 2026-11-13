import {
  CompanyVisitFrequency,
  VisitFrequencySource,
} from './entities/client.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

export const VISIT_FREQUENCY_MAX_INTERVALS = 5;
export const VISIT_FREQUENCY_MAX_DAYS = 3650;
export const ATTENDED_SESSION_STATUSES = [3, 4, 6];

export function estimateVisitFrequencyDays(
  visits: (Date | string | null | undefined)[],
  maxIntervals = VISIT_FREQUENCY_MAX_INTERVALS,
): number | null {
  const times = visits
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const days = Math.round((times[i] - times[i - 1]) / DAY_MS);
    if (days > 0) intervals.push(days);
  }

  const recent = intervals.slice(-maxIntervals);
  if (recent.length === 0) return null;

  const average = recent.reduce((sum, d) => sum + d, 0) / recent.length;
  return Math.max(1, Math.round(average));
}

export function upsertVisitFrequency(
  entries: CompanyVisitFrequency[] | null | undefined,
  companyId: number,
  days: number | null,
  source: VisitFrequencySource,
  now: Date = new Date(),
): CompanyVisitFrequency[] {
  const others = (entries ?? []).filter(
    (e) => Number(e.companyId) !== Number(companyId),
  );
  if (days === null) return others;
  return [...others, { companyId, days, source, updatedAt: now.toISOString() }];
}

export function visitFrequencyFor(
  entries: CompanyVisitFrequency[] | null | undefined,
  companyIds: number[],
): {
  visitFrequencyDays: number | null;
  visitFrequencySource: VisitFrequencySource | null;
} {
  const ids = companyIds.map(Number);
  const entry = (entries ?? []).find((e) => ids.includes(Number(e.companyId)));
  return {
    visitFrequencyDays: entry ? Number(entry.days) : null,
    visitFrequencySource: entry?.source ?? null,
  };
}

export type VisitFrequencyStage = 'soon' | 'due' | 'overdue';

export const VISIT_FREQUENCY_SOON_DAYS = 2;
export const VISIT_FREQUENCY_MIN_DAYS_FOR_SOON = 7;
export const VISIT_FREQUENCY_OVERDUE_DAYS = 5;
export const VISIT_FREQUENCY_OVERDUE_WINDOW_DAYS = 30;

function calendarDayIndex(date: Date, timeZone: string): number {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function calendarDaysBetween(
  from: Date,
  to: Date,
  timeZone: string,
): number {
  return calendarDayIndex(to, timeZone) - calendarDayIndex(from, timeZone);
}

export function visitFrequencyStage(
  frequencyDays: number,
  daysSinceLastVisit: number,
): VisitFrequencyStage | null {
  if (!frequencyDays || frequencyDays < 1) return null;
  const untilDue = frequencyDays - daysSinceLastVisit;
  if (untilDue > 0) {
    return untilDue <= VISIT_FREQUENCY_SOON_DAYS &&
      frequencyDays >= VISIT_FREQUENCY_MIN_DAYS_FOR_SOON
      ? 'soon'
      : null;
  }
  const daysLate = -untilDue;
  if (daysLate < VISIT_FREQUENCY_OVERDUE_DAYS) return 'due';
  if (daysLate <= VISIT_FREQUENCY_OVERDUE_WINDOW_DAYS) return 'overdue';
  return null;
}

export interface VisitFrequencyReminderItem {
  stage: VisitFrequencyStage;
  clientId: number;
  clientName: string;
  companyId: number;
  companyName: string;
  frequencyDays: number;
  daysSinceLastVisit: number;
  lastVisitLabel: string;
  phone: string | null;
}
