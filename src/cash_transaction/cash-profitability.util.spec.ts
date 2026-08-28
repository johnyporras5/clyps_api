import {
  buildProfitabilityReport,
  type ProfitabilityInput,
} from './cash-profitability.util';

const baseInput: ProfitabilityInput = {
  from: '2026-08-01',
  to: '2026-08-31',
  servicesMinor: 0,
  productsMinor: 0,
  manualIncomeByCategory: [],
  expenseByCategory: [],
  expenseBySupplier: [],
  servicesWithoutRate: 0,
  productsWithoutRate: 0,
};

const category = (
  categoryId: number,
  categoryName: string,
  amountMinor: number,
  count = 1,
) => ({ categoryId, categoryName, amountMinor, count });

describe('buildProfitabilityReport', () => {
  it('ganancia = ingresos − gastos', () => {
    const report = buildProfitabilityReport({
      ...baseInput,
      servicesMinor: 500000,
      productsMinor: 120000,
      manualIncomeByCategory: [category(7, 'Alquiler de silla', 250000)],
      expenseByCategory: [
        category(1, 'Alquiler', 300000),
        category(3, 'Limpieza', 45000),
      ],
    });

    expect(report.totals.incomeMinor).toBe(870000);
    expect(report.totals.expenseMinor).toBe(345000);
    expect(report.totals.profitMinor).toBe(525000);
    expect(report.totals.profitMinor).toBe(
      report.totals.incomeMinor - report.totals.expenseMinor,
    );
  });

  it('da ganancia negativa cuando se gasta más de lo que entra', () => {
    const report = buildProfitabilityReport({
      ...baseInput,
      servicesMinor: 100000,
      expenseByCategory: [category(1, 'Alquiler', 300000)],
    });

    expect(report.totals.profitMinor).toBe(-200000);
  });

  it('suma los servicios desde los cobros, sin movimientos manuales', () => {
    const report = buildProfitabilityReport({
      ...baseInput,
      servicesMinor: 500000,
    });

    expect(report.income.servicesMinor).toBe(500000);
    expect(report.income.manualMinor).toBe(0);
    expect(report.income.totalMinor).toBe(500000);
  });

  it('los ingresos manuales no duplican los de servicios ni productos', () => {
    const fromCollections = buildProfitabilityReport({
      ...baseInput,
      servicesMinor: 500000,
      productsMinor: 120000,
    });

    const withManual = buildProfitabilityReport({
      ...baseInput,
      servicesMinor: 500000,
      productsMinor: 120000,
      manualIncomeByCategory: [category(8, 'Venta eventual', 30000)],
    });

    // El manual se suma aparte: no toca ni infla las otras dos fuentes.
    expect(withManual.income.servicesMinor).toBe(
      fromCollections.income.servicesMinor,
    );
    expect(withManual.income.productsMinor).toBe(
      fromCollections.income.productsMinor,
    );
    expect(withManual.income.manualMinor).toBe(30000);
    expect(withManual.income.totalMinor).toBe(
      fromCollections.income.totalMinor + 30000,
    );
  });

  it('el total de ingresos es exactamente la suma de sus tres fuentes', () => {
    const report = buildProfitabilityReport({
      ...baseInput,
      servicesMinor: 500000,
      productsMinor: 120000,
      manualIncomeByCategory: [
        category(7, 'Alquiler de silla', 250000),
        category(8, 'Venta eventual', 30000),
      ],
    });

    expect(report.income.totalMinor).toBe(
      report.income.servicesMinor +
        report.income.productsMinor +
        report.income.manualMinor,
    );
    expect(report.income.manualMinor).toBe(280000);
  });

  it('ordena los desgloses de mayor a menor monto', () => {
    const report = buildProfitabilityReport({
      ...baseInput,
      expenseByCategory: [
        category(3, 'Limpieza', 45000),
        category(1, 'Alquiler', 300000),
        category(5, 'Insumos', 88000),
      ],
      expenseBySupplier: [
        {
          key: 'distribuidora peña',
          name: 'Distribuidora Peña',
          amountMinor: 12000,
          count: 1,
        },
        {
          key: 'ferreteria lopez',
          name: 'Ferretería López',
          amountMinor: 88000,
          count: 3,
        },
      ],
    });

    expect(report.expenses.byCategory.map((c) => c.categoryName)).toEqual([
      'Alquiler',
      'Insumos',
      'Limpieza',
    ]);
    expect(report.expenses.bySupplier[0].name).toBe('Ferretería López');
  });

  it('un período sin nada devuelve todo en cero, no falla', () => {
    const report = buildProfitabilityReport(baseInput);

    expect(report.totals.incomeMinor).toBe(0);
    expect(report.totals.expenseMinor).toBe(0);
    expect(report.totals.profitMinor).toBe(0);
    expect(report.expenses.byCategory).toEqual([]);
  });

  it('avisa que es un resumen de gestión, no contabilidad fiscal', () => {
    const report = buildProfitabilityReport(baseInput);

    expect(report.meta.note).toContain('no contabilidad fiscal');
    expect(report.meta.criteria).toBe('net');
  });
});
