import {
  CLOSING_CURRENCY_ORDER,
  CLOSING_METHODS,
  CLOSING_SOURCES,
  isBolivarMethod,
  normalizeClosingMethod,
  type ClosingMethod,
  type ClosingSource,
} from './cash-closing.enums';

export interface ClosingEntry {
  currency: string;
  method: ClosingMethod;
  source: ClosingSource;
  amountMinor: number;
}

export function paidEntry(
  rawMethod: string | null | undefined,
  currency: string,
  amountMinor: number,
  amountBsMinor: number | null,
  source: ClosingSource,
): ClosingEntry {
  const method = normalizeClosingMethod(rawMethod);
  const cur = currency.toUpperCase();
  if (cur !== 'VES' && amountBsMinor != null && isBolivarMethod(rawMethod)) {
    return { currency: 'VES', method, source, amountMinor: amountBsMinor };
  }
  return { currency: cur, method, source, amountMinor };
}

export interface CurrencyAmount {
  currency: string;
  amountMinor: number;
}

export interface CountedCell {
  currency: string;
  method: ClosingMethod;
  amountMinor: number;
}

export interface ExpectedCell {
  currency: string;
  method: ClosingMethod;
  amountMinor: number;
  tipsMinor: number;
  breakdown: Record<ClosingSource, number>;
}

export interface ClosingLine extends ExpectedCell {
  expectedMinor: number;
  countedMinor: number;
  differenceMinor: number;
}

const cellKey = (currency: string, method: string) => `${currency}|${method}`;

const emptyBreakdown = (): Record<ClosingSource, number> =>
  Object.fromEntries(CLOSING_SOURCES.map((s) => [s, 0])) as Record<
    ClosingSource,
    number
  >;

function currencyRank(currency: string): number {
  const i = CLOSING_CURRENCY_ORDER.indexOf(currency);
  return i === -1 ? CLOSING_CURRENCY_ORDER.length : i;
}

function compareCells(
  a: { currency: string; method: ClosingMethod },
  b: { currency: string; method: ClosingMethod },
): number {
  return (
    currencyRank(a.currency) - currencyRank(b.currency) ||
    a.currency.localeCompare(b.currency) ||
    CLOSING_METHODS.indexOf(a.method) - CLOSING_METHODS.indexOf(b.method)
  );
}

export function aggregateExpected(
  entries: ClosingEntry[],
  opening: CurrencyAmount[],
): ExpectedCell[] {
  const cells = new Map<string, ExpectedCell>();

  const add = (
    currency: string,
    rawMethod: ClosingMethod,
    source: ClosingSource,
    amountMinor: number,
  ) => {
    const cur = currency.toUpperCase();
    const method =
      rawMethod === 'cash' && cur === 'VES' ? 'cash_bs' : rawMethod;
    const key = cellKey(cur, method);
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        currency: cur,
        method,
        amountMinor: 0,
        tipsMinor: 0,
        breakdown: emptyBreakdown(),
      };
      cells.set(key, cell);
    }
    cell.amountMinor += amountMinor;
    cell.breakdown[source] += amountMinor;
    if (source === 'tips') cell.tipsMinor += amountMinor;
  };

  for (const o of opening) {
    if (o.amountMinor !== 0) add(o.currency, 'cash', 'opening', o.amountMinor);
  }
  for (const e of entries) add(e.currency, e.method, e.source, e.amountMinor);

  return [...cells.values()].sort(compareCells);
}

export function findDuplicateCell(counted: CountedCell[]): CountedCell | null {
  const seen = new Set<string>();
  for (const c of counted) {
    const key = cellKey(c.currency.toUpperCase(), c.method);
    if (seen.has(key)) return c;
    seen.add(key);
  }
  return null;
}

export function buildClosingLines(
  expected: ExpectedCell[],
  counted: CountedCell[],
): { lines: ClosingLine[]; missing: ExpectedCell[] } {
  const countedByKey = new Map(
    counted.map((c) => [cellKey(c.currency.toUpperCase(), c.method), c]),
  );

  const lines: ClosingLine[] = [];
  const missing: ExpectedCell[] = [];

  for (const cell of expected) {
    const key = cellKey(cell.currency, cell.method);
    const count = countedByKey.get(key);
    if (!count) {
      missing.push(cell);
      continue;
    }
    countedByKey.delete(key);
    lines.push({
      ...cell,
      expectedMinor: cell.amountMinor,
      countedMinor: count.amountMinor,
      differenceMinor: count.amountMinor - cell.amountMinor,
    });
  }

  for (const extra of countedByKey.values()) {
    lines.push({
      currency: extra.currency.toUpperCase(),
      method: extra.method,
      amountMinor: 0,
      tipsMinor: 0,
      breakdown: emptyBreakdown(),
      expectedMinor: 0,
      countedMinor: extra.amountMinor,
      differenceMinor: extra.amountMinor,
    });
  }

  return { lines: lines.sort(compareCells), missing };
}

export function countedCashByCurrency(lines: ClosingLine[]): CurrencyAmount[] {
  return lines
    .filter((l) => l.method === 'cash' || l.method === 'cash_bs')
    .map((l) => ({ currency: l.currency, amountMinor: l.countedMinor }));
}

export function totalsByCurrency(lines: ClosingLine[]): Array<{
  currency: string;
  expectedMinor: number;
  countedMinor: number;
  differenceMinor: number;
  tipsMinor: number;
}> {
  const map = new Map<
    string,
    {
      currency: string;
      expectedMinor: number;
      countedMinor: number;
      differenceMinor: number;
      tipsMinor: number;
    }
  >();
  for (const l of lines) {
    const t = map.get(l.currency) ?? {
      currency: l.currency,
      expectedMinor: 0,
      countedMinor: 0,
      differenceMinor: 0,
      tipsMinor: 0,
    };
    t.expectedMinor += l.expectedMinor;
    t.countedMinor += l.countedMinor;
    t.differenceMinor += l.differenceMinor;
    t.tipsMinor += l.tipsMinor;
    map.set(l.currency, t);
  }
  return [...map.values()].sort(
    (a, b) =>
      currencyRank(a.currency) - currencyRank(b.currency) ||
      a.currency.localeCompare(b.currency),
  );
}
