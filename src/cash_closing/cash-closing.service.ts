import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { CashClosing } from './entities/cash-closing.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCashClosingDto } from './dto/create-cash-closing.dto';
import { toMinor } from '../payroll/payroll-money.util';
import {
  businessDayBounds,
  businessToday,
  inclusiveDayCount,
} from '../common/utils/business-time.util';
import { normalizeClosingMethod } from './cash-closing.enums';
import {
  aggregateExpected,
  buildClosingLines,
  countedCashByCurrency,
  findDuplicateCell,
  paidEntry,
  leftoverTipBsMinor,
  splitProductPortion,
  tipsFromAttributions,
  totalsByCurrency,
  type ClosingEntry,
  type CurrencyAmount,
} from './cash-closing.util';

const num = (value: string | number | null | undefined): number => {
  if (value == null) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
};

const upper = (value: string | null | undefined, fallback: string) =>
  (value || fallback).toUpperCase();

const MAX_HISTORY_DAYS = 366;

@Injectable()
export class CashClosingService {
  constructor(
    @InjectRepository(CashClosing)
    private readonly closingRepository: Repository<CashClosing>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company;
  }

  async preview(adminId: number, date: string) {
    const company = await this.getCompanyOrFail(adminId);
    const [{ openingCash, expected, previousClosingDate }, activeClosing] =
      await Promise.all([
        this.computeExpected(company.id, date),
        this.closingRepository.findOne({
          where: { companyId: company.id, date, status: 'closed' },
        }),
      ]);

    return {
      date,
      status: activeClosing ? 'closed' : 'open',
      isFuture: date > businessToday(),
      activeClosing: activeClosing ? this.toResponse(activeClosing) : null,
      previousClosingDate,
      openingCash,
      expected,
      totals: totalsByCurrency(
        expected.map((cell) => ({
          ...cell,
          expectedMinor: cell.amountMinor,
          countedMinor: 0,
          differenceMinor: 0,
        })),
      ).map(({ currency, expectedMinor, tipsMinor }) => ({
        currency,
        expectedMinor,
        tipsMinor,
      })),
    };
  }

  async create(adminId: number, dto: CreateCashClosingDto) {
    const company = await this.getCompanyOrFail(adminId);

    if (dto.date > businessToday()) {
      throw new BadRequestException(
        'No se puede cerrar un día que no ha pasado.',
      );
    }

    const duplicate = findDuplicateCell(dto.counted);
    if (duplicate) {
      throw new BadRequestException(
        `La celda ${duplicate.currency} / ${duplicate.method} viene repetida.`,
      );
    }

    const active = await this.closingRepository.findOne({
      where: { companyId: company.id, date: dto.date, status: 'closed' },
      select: ['id'],
    });
    if (active) {
      throw new ConflictException({
        code: 'CASH_DAY_CLOSED',
        message: `La caja del ${dto.date} ya está cerrada.`,
        date: dto.date,
        closingId: active.id,
      });
    }

    const { openingCash, expected } = await this.computeExpected(
      company.id,
      dto.date,
    );
    const { lines, missing } = buildClosingLines(expected, dto.counted);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'CASH_CLOSING_MISSING_COUNT',
        message: `Falta contar: ${missing
          .map((m) => `${m.currency} / ${m.method}`)
          .join(', ')}.`,
        missing: missing.map(({ currency, method }) => ({ currency, method })),
      });
    }

    const hasDifference = lines.some((l) => l.differenceMinor !== 0);
    const notes = dto.notes?.trim() || null;
    if (hasDifference && !notes) {
      throw new BadRequestException(
        'La caja no cuadra: explica la diferencia en las notas.',
      );
    }

    const retainedCash = this.resolveRetainedCash(
      countedCashByCurrency(lines),
      dto.retainedCash,
    );

    const last = await this.closingRepository.findOne({
      where: { companyId: company.id, date: dto.date },
      order: { version: 'DESC' },
      select: ['version'],
    });

    try {
      const saved = await this.closingRepository.save(
        this.closingRepository.create({
          companyId: company.id,
          date: dto.date,
          version: (last?.version ?? 0) + 1,
          status: 'closed',
          openingCash,
          lines,
          retainedCash,
          hasDifference,
          notes,
          closedByUserId: adminId,
        }),
      );
      return this.toResponse(saved);
    } catch (error) {
      const code =
        (error as { code?: string })?.code ??
        (error as { driverError?: { code?: string } })?.driverError?.code;
      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException({
          code: 'CASH_DAY_CLOSED',
          message: `La caja del ${dto.date} ya está cerrada.`,
          date: dto.date,
        });
      }
      throw error;
    }
  }

  async revert(id: number, adminId: number, reason: string) {
    const company = await this.getCompanyOrFail(adminId);
    const closing = await this.findOwnedOrFail(id, company.id);
    if (closing.status !== 'closed') {
      throw new ConflictException('Este cierre ya fue revertido.');
    }

    closing.status = 'reverted';
    closing.revertedByUserId = adminId;
    closing.revertedAt = new Date();
    closing.revertReason = reason.trim();
    await this.closingRepository.save(closing);
    return this.toResponse(closing);
  }

  async findAll(
    adminId: number,
    from: string,
    to: string,
    includeReverted = true,
  ) {
    if (from > to) {
      throw new BadRequestException(
        'El rango de fechas está invertido: "from" es posterior a "to".',
      );
    }
    if (inclusiveDayCount(from, to) > MAX_HISTORY_DAYS) {
      throw new BadRequestException(
        `El rango no puede pasar de ${MAX_HISTORY_DAYS} días.`,
      );
    }
    const company = await this.getCompanyOrFail(adminId);
    const closings = await this.closingRepository.find({
      where: {
        companyId: company.id,
        date: Between(from, to),
        ...(includeReverted ? {} : { status: 'closed' as const }),
      },
      order: { date: 'DESC', version: 'DESC' },
    });
    const names = await this.loadUserNames(closings);
    return closings.map((c) => this.toSummary(c, names));
  }

  async findOne(id: number, adminId: number) {
    const company = await this.getCompanyOrFail(adminId);
    const closing = await this.findOwnedOrFail(id, company.id);
    const versions = await this.closingRepository.find({
      where: { companyId: company.id, date: closing.date },
      order: { version: 'DESC' },
    });
    const names = await this.loadUserNames(versions);
    return {
      ...this.toResponse(closing, names),
      versions: versions.map((v) => this.toSummary(v, names)),
    };
  }

  private async findOwnedOrFail(
    id: number,
    companyId: number,
  ): Promise<CashClosing> {
    const closing = await this.closingRepository.findOne({
      where: { id, companyId },
    });
    if (!closing)
      throw new NotFoundException(`Cierre de caja con id ${id} no encontrado`);
    return closing;
  }

  private resolveRetainedCash(
    countedCash: CurrencyAmount[],
    requested: CurrencyAmount[] | undefined,
  ): CurrencyAmount[] {
    if (!requested) return countedCash.filter((c) => c.amountMinor > 0);

    const counted = new Map(
      countedCash.map((c) => [c.currency, c.amountMinor]),
    );
    const seen = new Set<string>();
    const result: CurrencyAmount[] = [];
    for (const r of requested) {
      const currency = r.currency.toUpperCase();
      if (seen.has(currency)) {
        throw new BadRequestException(
          `El fondo en ${currency} viene repetido.`,
        );
      }
      seen.add(currency);
      const available = counted.get(currency) ?? 0;
      if (r.amountMinor > available) {
        throw new BadRequestException(
          `El fondo en ${currency} no puede superar el efectivo contado.`,
        );
      }
      if (r.amountMinor > 0)
        result.push({ currency, amountMinor: r.amountMinor });
    }
    return result;
  }

  private async computeExpected(companyId: number, date: string) {
    const { startOfDay, endOfDay } = businessDayBounds(date);

    const previous = await this.closingRepository.findOne({
      where: { companyId, date: LessThan(date), status: 'closed' },
      order: { date: 'DESC' },
      select: ['date', 'retainedCash'],
    });
    const openingCash = previous?.retainedCash ?? [];

    const [sessionEntries, saleEntries, manualEntries] = await Promise.all([
      this.getSessionPaymentEntries(companyId, startOfDay, endOfDay),
      this.getDirectSaleEntries(companyId, startOfDay, endOfDay),
      this.getManualEntries(companyId, date),
    ]);

    return {
      openingCash,
      previousClosingDate: previous?.date ?? null,
      expected: aggregateExpected(
        [...sessionEntries, ...saleEntries, ...manualEntries],
        openingCash,
      ),
    };
  }

  private async getSessionPaymentEntries(
    companyId: number,
    from: Date,
    to: Date,
  ): Promise<ClosingEntry[]> {
    const payments: Array<{
      id: number;
      sessionId: number;
      method: string | null;
      tip: string | null;
      tipCurrency: string | null;
      tipBs: string | null;
      adjustmentBs: string | null;
      attributions: unknown;
    }> = await this.closingRepository.query(
      `SELECT sp.id AS id,
              sp.session_id AS sessionId,
              sp.method AS method,
              sp.tip AS tip,
              sp.tip_currency AS tipCurrency,
              sp.tip_bs AS tipBs,
              sp.company_adjustment_bs AS adjustmentBs,
              sp.attributions AS attributions
         FROM session_payments sp
        WHERE sp.collected_at BETWEEN ? AND ?
          AND EXISTS (
            SELECT 1 FROM session_detail sd
              JOIN company_worker cw ON cw.id = sd.company_worker_id
             WHERE sd.session_id = sp.session_id AND cw.company_id = ?
          )`,
      [from, to, companyId],
    );
    if (payments.length === 0) return [];

    const paymentIds = payments.map((p) => Number(p.id));
    const sessionIds = payments.map((p) => Number(p.sessionId));

    const lines: Array<{
      paymentId: number;
      currency: string;
      subtotal: string | null;
      subtotalBs: string | null;
      method: string | null;
    }> = await this.closingRepository.query(
      `SELECT l.payment_id AS paymentId,
              UPPER(l.currency) AS currency,
              l.subtotal AS subtotal,
              l.subtotal_bs AS subtotalBs,
              l.method AS method
         FROM session_payment_lines l
        WHERE l.payment_id IN (?)`,
      [paymentIds],
    );

    const linesByPayment = new Map<number, typeof lines>();
    for (const l of lines) {
      const id = Number(l.paymentId);
      linesByPayment.set(id, [...(linesByPayment.get(id) ?? []), l]);
    }
    const entries: ClosingEntry[] = [];
    const methodOf = (p: (typeof payments)[number]): string | null =>
      p.method ??
      linesByPayment.get(Number(p.id))?.find((l) => l.method)?.method ??
      null;

    const productRows: Array<{
      sessionId: number;
      currency: string;
      amountMinor: string | number;
    }> = await this.closingRepository.query(
      `SELECT sp.session_id AS sessionId,
              UPPER(COALESCE(sp.currency, 'USD')) AS currency,
              SUM(sp.unit_price_minor * sp.quantity) AS amountMinor
         FROM session_product sp
        WHERE sp.session_id IN (?)
          AND sp.sale_type = 'client'
        GROUP BY sp.session_id, UPPER(COALESCE(sp.currency, 'USD'))`,
      [sessionIds],
    );
    const productsBySession = new Map<number, Map<string, number>>();
    for (const r of productRows) {
      const id = Number(r.sessionId);
      const byCurrency = productsBySession.get(id) ?? new Map<string, number>();
      byCurrency.set(r.currency, Math.round(num(r.amountMinor)));
      productsBySession.set(id, byCurrency);
    }

    for (const p of payments) {
      const productsLeft =
        productsBySession.get(Number(p.sessionId)) ?? new Map<string, number>();
      for (const l of linesByPayment.get(Number(p.id)) ?? []) {
        const method = l.method ?? p.method;
        const split = splitProductPortion(
          toMinor(l.subtotal),
          l.subtotalBs != null ? toMinor(l.subtotalBs) : null,
          productsLeft.get(l.currency) ?? 0,
        );
        productsLeft.set(
          l.currency,
          (productsLeft.get(l.currency) ?? 0) - split.productMinor,
        );
        if (split.restMinor > 0 || split.productMinor === 0) {
          entries.push(
            paidEntry(
              method,
              l.currency,
              split.restMinor,
              split.restBsMinor,
              'sessions',
            ),
          );
        }
        if (split.productMinor > 0) {
          entries.push(
            paidEntry(
              method,
              l.currency,
              split.productMinor,
              split.productBsMinor,
              'products',
            ),
          );
        }
      }
      if (num(p.tip) > 0) {
        entries.push(
          paidEntry(
            methodOf(p),
            upper(p.tipCurrency, 'USD'),
            toMinor(p.tip),
            p.tipBs != null ? toMinor(p.tipBs) : null,
            'tips',
          ),
        );
      }
      if (num(p.adjustmentBs) !== 0) {
        entries.push(
          paidEntry(
            methodOf(p),
            'VES',
            toMinor(p.adjustmentBs),
            null,
            'adjustments',
          ),
        );
      }
    }

    for (const p of payments) {
      for (const tip of tipsFromAttributions(p.attributions)) {
        entries.push(
          paidEntry(
            methodOf(p),
            tip.currency,
            tip.amountMinor,
            tip.amountBsMinor,
            'tips',
          ),
        );
      }
    }

    return entries;
  }

  private async getDirectSaleEntries(
    companyId: number,
    from: Date,
    to: Date,
  ): Promise<ClosingEntry[]> {
    const sales: Array<{
      id: number;
      method: string | null;
      saleLines: unknown;
      adjustmentBs: string | null;
      totalBs: string | null;
    }> = await this.closingRepository.query(
      `SELECT ds.id AS id,
              ds.method AS method,
              ds.\`lines\` AS saleLines,
              ds.company_adjustment_bs AS adjustmentBs,
              ds.total_bs AS totalBs
         FROM direct_sale ds
        WHERE ds.company_id = ?
          AND ds.collected_at BETWEEN ? AND ?`,
      [companyId, from, to],
    );
    if (sales.length === 0) return [];

    const tips: Array<{
      saleId: number;
      currency: string;
      amountMinor: string;
      amountBsMinor: string | null;
    }> = await this.closingRepository.query(
      `SELECT p.direct_sale_id AS saleId,
              UPPER(pc.currency) AS currency,
              pc.amount_minor AS amountMinor,
              pc.amount_bs_minor AS amountBsMinor
         FROM payroll_concept pc
         JOIN session_product p ON p.id = pc.source_id
        WHERE pc.company_id = ?
          AND pc.type = 'tip'
          AND pc.source_type = 'direct_sale'
          AND p.direct_sale_id IN (?)`,
      [companyId, sales.map((s) => Number(s.id))],
    );

    const entries: ClosingEntry[] = [];
    const saleById = new Map(sales.map((s) => [Number(s.id), s]));

    const salesWithPayrollTips = new Set(tips.map((t) => Number(t.saleId)));

    for (const sale of sales) {
      const saleLines = parseJsonArray(sale.saleLines);
      if (!salesWithPayrollTips.has(Number(sale.id))) {
        const leftover = leftoverTipBsMinor(
          sale.totalBs != null ? toMinor(sale.totalBs) : null,
          saleLines.map((line) => {
            const bs = line.subtotalBs as string | number | null | undefined;
            return bs != null ? toMinor(bs) : null;
          }),
        );
        if (leftover > 0) {
          entries.push(paidEntry(sale.method, 'VES', leftover, null, 'tips'));
        }
      }
      for (const line of saleLines) {
        const currency =
          typeof line.currency === 'string' ? line.currency : 'VES';
        const subtotalBs = line.subtotalBs as string | number | null;
        entries.push(
          paidEntry(
            (typeof line.method === 'string' ? line.method : null) ??
              sale.method,
            currency,
            toMinor(line.subtotal as string | number | null),
            subtotalBs != null ? toMinor(subtotalBs) : null,
            'directSales',
          ),
        );
      }
      if (num(sale.adjustmentBs) !== 0) {
        entries.push(
          paidEntry(
            sale.method,
            'VES',
            toMinor(sale.adjustmentBs),
            null,
            'adjustments',
          ),
        );
      }
    }

    for (const t of tips) {
      const sale = saleById.get(Number(t.saleId));
      if (!sale) continue;
      entries.push(
        paidEntry(
          sale.method,
          upper(t.currency, 'VES'),
          Math.round(num(t.amountMinor)),
          t.amountBsMinor != null ? Math.round(num(t.amountBsMinor)) : null,
          'tips',
        ),
      );
    }

    return entries;
  }

  private async getManualEntries(
    companyId: number,
    date: string,
  ): Promise<ClosingEntry[]> {
    const rows: Array<{
      kind: string;
      currency: string;
      method: string;
      amountMinor: string;
    }> = await this.closingRepository.query(
      `SELECT t.kind AS kind,
              UPPER(t.currency) AS currency,
              t.payment_method AS method,
              t.amount_minor AS amountMinor
         FROM cash_transaction t
        WHERE t.company_id = ?
          AND t.date = ?`,
      [companyId, date],
    );
    return rows.map((r) => {
      const amount = Math.round(num(r.amountMinor));
      const isIncome = r.kind === 'income';
      return {
        currency: r.currency,
        method: normalizeClosingMethod(r.method),
        source: isIncome ? 'manualIncome' : 'manualExpense',
        amountMinor: isIncome ? amount : -amount,
      };
    });
  }

  private async loadUserNames(
    closings: CashClosing[],
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(
        closings.flatMap((c) =>
          [c.closedByUserId, c.revertedByUserId].filter(
            (id): id is number => id != null,
          ),
        ),
      ),
    ];
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: number; username: string | null }> =
      await this.closingRepository.query(
        `SELECT id, username FROM \`user\` WHERE id IN (?)`,
        [ids],
      );
    return new Map(rows.map((r) => [Number(r.id), r.username ?? '']));
  }

  private toSummary(closing: CashClosing, names = new Map<number, string>()) {
    return {
      id: closing.id,
      date: closing.date,
      version: closing.version,
      status: closing.status,
      hasDifference: closing.hasDifference,
      totals: totalsByCurrency(closing.lines),
      notes: closing.notes,
      closedAt: closing.closedAt,
      closedBy: {
        id: closing.closedByUserId,
        name: names.get(closing.closedByUserId) ?? null,
      },
      revertedAt: closing.revertedAt,
      revertedBy:
        closing.revertedByUserId != null
          ? {
              id: closing.revertedByUserId,
              name: names.get(closing.revertedByUserId) ?? null,
            }
          : null,
      revertReason: closing.revertReason,
    };
  }

  private toResponse(closing: CashClosing, names = new Map<number, string>()) {
    return {
      ...this.toSummary(closing, names),
      openingCash: closing.openingCash,
      lines: closing.lines,
      retainedCash: closing.retainedCash,
    };
  }
}

function parseJsonArray(raw: unknown): Array<Record<string, unknown>> {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}
