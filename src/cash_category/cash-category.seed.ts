import type { CashCategoryKind } from './cash-category.enums';

/**
 * Categorías con las que arranca una company al abrir caja por primera vez
 * (CLYP-353). Son solo un punto de partida: el dueño las renombra, desactiva o
 * borra como quiera.
 *
 * "Otros" va una sola vez con kind 'both' en lugar de duplicarse como gasto e
 * ingreso: para eso existe `both`, y así el selector no muestra dos "Otros".
 */
export const DEFAULT_CASH_CATEGORIES: ReadonlyArray<{
  name: string;
  kind: CashCategoryKind;
}> = [
  // Gastos
  { name: 'Alquiler', kind: 'expense' },
  { name: 'Servicios (luz/agua)', kind: 'expense' },
  { name: 'Limpieza', kind: 'expense' },
  { name: 'Reparaciones', kind: 'expense' },
  { name: 'Insumos', kind: 'expense' },
  { name: 'Nómina', kind: 'expense' },
  // Ingresos
  { name: 'Alquiler de silla', kind: 'income' },
  { name: 'Venta eventual', kind: 'income' },
  // Sirve para las dos direcciones
  { name: 'Otros', kind: 'both' },
];
