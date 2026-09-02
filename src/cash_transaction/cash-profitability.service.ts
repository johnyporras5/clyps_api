import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashTransaction } from './entities/cash-transaction.entity';
import { Company } from '../company/entities/company.entity';
import { ReportsService } from '../reports/reports.service';
import { toMinor } from '../payroll/payroll-money.util';
import {
  buildProfitabilityReport,
  type CategoryAggregate,
  type SupplierAggregate,
} from './cash-profitability.util';

/** Línea de producto vendida a un cliente, con su moneda y su origen. */
interface ProductRow {
  currency: string;
  sessionId: number | null;
  directSaleId: number | null;
  revenueMinor: string | number | null;
  costMinor: string | number | null;
  commissionMinor: string | number | null;
}

const num = (value: string | number | null | undefined): number => {
  if (value == null) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class CashProfitabilityService {
  constructor(
    @InjectRepository(CashTransaction)
    private readonly transactionRepository: Repository<CashTransaction>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly reportsService: ReportsService,
  ) {}

  /**
   * Ganancia real del período (CLYP-357): lo que entró por cobros y por caja,
   * menos lo que salió por caja.
   *
   * Los ingresos por servicios y productos NO se registran a mano: se leen del
   * sistema de cobros que ya existe. Los movimientos manuales son solo lo que no
   * viene de una cita.
   */
  async getProfitability(adminId: number, from: string, to: string) {
    if (from > to) {
      throw new BadRequestException(
        'El rango de fechas está invertido: "from" es posterior a "to".',
      );
    }

    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');

    const [services, products, cash] = await Promise.all([
      // Se reusa el reporte de ingresos que ya existe en vez de recalcular los
      // cobros: un solo criterio para toda la app (parte del negocio, por fecha
      // de cobro, moneda extranjera a tasa histórica).
      this.reportsService.getCompanyIncome(adminId, from, to),
      this.getProductsNetMinor(company.id, from, to),
      this.getCashAggregates(company.id, from, to),
    ]);

    return buildProfitabilityReport({
      from,
      to,
      servicesMinor: toMinor(services.totalBsAccumulated),
      productsMinor: products.netMinor,
      manualIncomeByCategory: cash.income,
      expenseByCategory: cash.expenses,
      expenseBySupplier: cash.suppliers,
      servicesWithoutRate: services.meta.missingRateDetails,
      productsWithoutRate: products.withoutRate,
    });
  }

  /**
   * Productos vendidos a clientes en el rango, netos de costo y comisión, en
   * céntimos de Bs.
   *
   * Las compras de los trabajadores quedan fuera: no son ingreso del negocio,
   * son una deducción de nómina.
   *
   * `session_product` guarda los montos en la moneda de la venta y no lleva
   * tasa, así que la tasa histórica se busca en el cobro que la originó — el
   * pago de la cita o la venta directa. Lo que no tenga tasa se cuenta aparte y
   * NO entra al total: es preferible un total incompleto y avisado que uno
   * inventado.
   */
  private async getProductsNetMinor(
    companyId: number,
    from: string,
    to: string,
  ): Promise<{ netMinor: number; withoutRate: number }> {
    const rows: ProductRow[] = await this.transactionRepository.query(
      `SELECT UPPER(COALESCE(sp.currency, 'VES')) AS currency,
              sp.session_id AS sessionId,
              sp.direct_sale_id AS directSaleId,
              (sp.unit_price_minor * sp.quantity) AS revenueMinor,
              COALESCE(sp.cost_minor, 0) AS costMinor,
              COALESCE(sp.commission_minor, 0) AS commissionMinor
         FROM session_product sp
        WHERE sp.company_id = ?
          AND sp.sale_type = 'client'
          AND DATE(sp.created_at) BETWEEN ? AND ?`,
      [companyId, from, to],
    );
    if (rows.length === 0) return { netMinor: 0, withoutRate: 0 };

    const rates = await this.loadExchangeRates(rows);

    let netMinor = 0;
    let withoutRate = 0;

    for (const row of rows) {
      const net =
        num(row.revenueMinor) - num(row.costMinor) - num(row.commissionMinor);

      if (row.currency === 'VES') {
        netMinor += net;
        continue;
      }

      const rate = rates.get(rateKey(row));
      if (rate == null) {
        withoutRate += 1;
        continue;
      }
      // Céntimos de la moneda × (Bs por unidad) = céntimos de Bs.
      netMinor += Math.round(net * rate);
    }

    return { netMinor: Math.round(netMinor), withoutRate };
  }

  /** Tasas históricas de los cobros que originaron estas líneas de producto. */
  private async loadExchangeRates(
    rows: ProductRow[],
  ): Promise<Map<string, number>> {
    const rates = new Map<string, number>();

    const sessionIds = [
      ...new Set(
        rows
          .filter((r) => r.currency !== 'VES' && r.sessionId != null)
          .map((r) => Number(r.sessionId)),
      ),
    ];
    const directSaleIds = [
      ...new Set(
        rows
          .filter((r) => r.currency !== 'VES' && r.directSaleId != null)
          .map((r) => Number(r.directSaleId)),
      ),
    ];

    if (sessionIds.length > 0) {
      // Mismo criterio que el reporte de ingresos: la tasa se promedia por
      // (cobro, moneda) para no multiplicar filas si el cobro tuvo varios
      // renglones en esa moneda.
      const sessionRates: Array<{
        sessionId: number;
        currency: string;
        rate: string | number | null;
      }> = await this.transactionRepository.query(
        `SELECT sp.session_id AS sessionId,
                UPPER(l.currency) AS currency,
                AVG(l.exchange_rate) AS rate
           FROM session_payments sp
           JOIN session_payment_lines l ON l.payment_id = sp.id
          WHERE sp.session_id IN (?)
          GROUP BY sp.session_id, UPPER(l.currency)`,
        [sessionIds],
      );
      for (const r of sessionRates) {
        const rate = num(r.rate);
        if (rate > 0) rates.set(`s:${r.sessionId}:${r.currency}`, rate);
      }
    }

    if (directSaleIds.length > 0) {
      // La venta directa guarda su desglose por moneda como JSON.
      const sales: Array<{ id: number; lines: unknown }> =
        await this.transactionRepository.query(
          `SELECT id, lines FROM direct_sale WHERE id IN (?)`,
          [directSaleIds],
        );
      for (const sale of sales) {
        for (const line of parseSaleLines(sale.lines)) {
          const currency =
            typeof line.currency === 'string'
              ? line.currency.toUpperCase()
              : '';
          const rate = num(line.exchangeRate as string | number | null);
          if (currency && rate > 0) {
            rates.set(`d:${sale.id}:${currency}`, rate);
          }
        }
      }
    }

    return rates;
  }

  /** Movimientos de caja del rango, agrupados por categoría y por proveedor. */
  private async getCashAggregates(
    companyId: number,
    from: string,
    to: string,
  ): Promise<{
    income: CategoryAggregate[];
    expenses: CategoryAggregate[];
    suppliers: SupplierAggregate[];
  }> {
    const byCategory: Array<{
      kind: string;
      categoryId: number;
      categoryName: string | null;
      amountMinor: string | number | null;
      count: string | number | null;
    }> = await this.transactionRepository.query(
      `SELECT t.kind AS kind,
              t.category_id AS categoryId,
              c.name AS categoryName,
              SUM(t.amount_bs_minor) AS amountMinor,
              COUNT(*) AS count
         FROM cash_transaction t
         LEFT JOIN cash_category c ON c.id = t.category_id
        WHERE t.company_id = ?
          AND t.date BETWEEN ? AND ?
        GROUP BY t.kind, t.category_id, c.name`,
      [companyId, from, to],
    );

    const toAggregate = (
      row: (typeof byCategory)[number],
    ): CategoryAggregate => ({
      categoryId: Number(row.categoryId),
      categoryName: row.categoryName ?? 'Sin categoría',
      amountMinor: num(row.amountMinor),
      count: num(row.count),
    });

    const bySupplier: Array<{
      key: string;
      name: string;
      amountMinor: string | number | null;
      count: string | number | null;
    }> = await this.transactionRepository.query(
      `SELECT k.supplier_key AS \`key\`,
              k.name AS name,
              k.amount_minor AS amountMinor,
              k.cnt AS count
         FROM (
           SELECT supplier_key,
                  FIRST_VALUE(supplier_name) OVER (
                    PARTITION BY supplier_key ORDER BY \`date\` DESC, id DESC
                  ) AS name,
                  SUM(amount_bs_minor) OVER (PARTITION BY supplier_key) AS amount_minor,
                  COUNT(*) OVER (PARTITION BY supplier_key) AS cnt,
                  ROW_NUMBER() OVER (
                    PARTITION BY supplier_key ORDER BY \`date\` DESC, id DESC
                  ) AS rn
             FROM cash_transaction
            WHERE company_id = ?
              AND kind = 'expense'
              AND supplier_key IS NOT NULL
              AND \`date\` BETWEEN ? AND ?
         ) k
        WHERE k.rn = 1`,
      [companyId, from, to],
    );

    return {
      income: byCategory.filter((r) => r.kind === 'income').map(toAggregate),
      expenses: byCategory.filter((r) => r.kind === 'expense').map(toAggregate),
      suppliers: bySupplier.map((r) => ({
        key: r.key,
        name: r.name,
        amountMinor: num(r.amountMinor),
        count: num(r.count),
      })),
    };
  }
}

/** Clave de la tasa: el cobro del que salió la línea, más su moneda. */
function rateKey(row: ProductRow): string {
  return row.sessionId != null
    ? `s:${Number(row.sessionId)}:${row.currency}`
    : `d:${Number(row.directSaleId)}:${row.currency}`;
}

/** `direct_sale.lines` puede venir como JSON ya parseado o como texto. */
function parseSaleLines(lines: unknown): Array<Record<string, unknown>> {
  const value = typeof lines === 'string' ? safeParse(lines) : lines;
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
