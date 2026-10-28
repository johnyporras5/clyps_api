export type ClosingMethod =
  | 'cash'
  | 'cash_bs'
  | 'mobile_payment'
  | 'transfer'
  | 'card'
  | 'other';

export const CLOSING_METHODS: ClosingMethod[] = [
  'cash',
  'cash_bs',
  'mobile_payment',
  'transfer',
  'card',
  'other',
];

export function normalizeClosingMethod(
  raw: string | null | undefined,
): ClosingMethod {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'cash':
    case 'efectivo':
      return 'cash';
    case 'cash_bs':
      return 'cash_bs';
    case 'mobile_payment':
    case 'pago_movil':
      return 'mobile_payment';
    case 'transfer':
    case 'transferencia':
      return 'transfer';
    case 'card':
    case 'tarjeta':
      return 'card';
    default:
      return 'other';
  }
}

const BOLIVAR_METHODS = new Set([
  'cash_bs',
  'mobile_payment',
  'pago_movil',
  'transfer',
  'transferencia',
  'card',
  'tarjeta',
]);

export function isBolivarMethod(raw: string | null | undefined): boolean {
  return BOLIVAR_METHODS.has((raw ?? '').trim().toLowerCase());
}

export type ClosingSource =
  | 'opening'
  | 'sessions'
  | 'products'
  | 'directSales'
  | 'tips'
  | 'adjustments'
  | 'manualIncome'
  | 'manualExpense';

export const CLOSING_SOURCES: ClosingSource[] = [
  'opening',
  'sessions',
  'products',
  'directSales',
  'tips',
  'adjustments',
  'manualIncome',
  'manualExpense',
];

export type CashClosingStatus = 'closed' | 'reverted';

export const CLOSING_CURRENCY_ORDER = ['VES', 'USD', 'EUR'];
