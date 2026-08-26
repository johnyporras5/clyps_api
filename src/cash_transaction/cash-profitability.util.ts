/**
 * Armado del reporte de rentabilidad (CLYP-357).
 *
 * Esta parte es pura a propósito: recibe los agregados ya leídos de la base y
 * solo hace las cuentas. Así la regla del ticket — ganancia = ingresos − gastos,
 * y los manuales NO duplican lo que ya viene de los cobros — se puede probar sin
 * tocar la base.
 *
 * Todo el dinero va en céntimos de Bs, igual que el resto de la caja.
 */

/** Agregado por categoría de caja. */
export interface CategoryAggregate {
  categoryId: number;
  categoryName: string;
  amountMinor: number;
  count: number;
}

/** Agregado por proveedor (solo gastos). */
export interface SupplierAggregate {
  key: string;
  name: string;
  amountMinor: number;
  count: number;
}

export interface ProfitabilityInput {
  from: string;
  to: string;
  /** Servicios cobrados, parte del negocio, en céntimos de Bs. */
  servicesMinor: number;
  /** Productos vendidos a clientes, neto de costo y comisión. */
  productsMinor: number;
  /** Movimientos de caja con kind='income', por categoría. */
  manualIncomeByCategory: CategoryAggregate[];
  /** Movimientos de caja con kind='expense', por categoría. */
  expenseByCategory: CategoryAggregate[];
  /** Gastos agrupados por proveedor. */
  expenseBySupplier: SupplierAggregate[];
  /** Cobros de servicios en moneda extranjera sin tasa histórica. */
  servicesWithoutRate: number;
  /** Líneas de producto en moneda extranjera sin tasa histórica. */
  productsWithoutRate: number;
}

export const MANAGEMENT_SUMMARY_NOTE =
  'Resumen de gestión, no contabilidad fiscal.';

const sumAmount = (rows: Array<{ amountMinor: number }>): number =>
  rows.reduce((acc, row) => acc + row.amountMinor, 0);

const byAmountDesc = <T extends { amountMinor: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.amountMinor - a.amountMinor);

/**
 * Ingresos − gastos, con el desglose que pide el ticket.
 *
 * Las tres fuentes de ingreso son independientes por construcción: servicios y
 * productos salen de los cobros (`session_payments` / `session_product`) y los
 * manuales de `cash_transaction`. Un servicio cobrado NO se registra a mano, así
 * que sumarlas no duplica nada.
 */
export function buildProfitabilityReport(input: ProfitabilityInput) {
  const manualIncomeByCategory = byAmountDesc(input.manualIncomeByCategory);
  const expenseByCategory = byAmountDesc(input.expenseByCategory);
  const expenseBySupplier = byAmountDesc(input.expenseBySupplier);

  const manualIncomeMinor = sumAmount(manualIncomeByCategory);
  const incomeTotalMinor =
    input.servicesMinor + input.productsMinor + manualIncomeMinor;
  const expenseTotalMinor = sumAmount(expenseByCategory);

  return {
    range: { from: input.from, to: input.to },
    currency: 'VES',
    // Servicios: por fecha de cobro (`collected_at`), no de la cita.
    basis: 'collected' as const,
    totals: {
      incomeMinor: incomeTotalMinor,
      expenseMinor: expenseTotalMinor,
      profitMinor: incomeTotalMinor - expenseTotalMinor,
    },
    income: {
      totalMinor: incomeTotalMinor,
      // De los cobros existentes; el dueño no los registra a mano.
      servicesMinor: input.servicesMinor,
      productsMinor: input.productsMinor,
      // Lo que NO viene de una cita: lo que el dueño anotó en caja.
      manualMinor: manualIncomeMinor,
      manualByCategory: manualIncomeByCategory,
    },
    expenses: {
      totalMinor: expenseTotalMinor,
      byCategory: expenseByCategory,
      bySupplier: expenseBySupplier,
    },
    meta: {
      // Criterio elegido: los ingresos ya vienen netos de la comisión del
      // trabajador y del costo del producto. Por eso la nómina NO debería
      // registrarse además como gasto manual: se restaría dos veces.
      criteria: 'net' as const,
      note: MANAGEMENT_SUMMARY_NOTE,
      // Cobros en moneda extranjera que no pudieron llevarse a Bs por falta de
      // tasa histórica: quedaron FUERA de los totales, no se inventó conversión.
      servicesWithoutRate: input.servicesWithoutRate,
      productsWithoutRate: input.productsWithoutRate,
    },
  };
}
