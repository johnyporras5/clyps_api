/**
 * Primitivas de dinero de las suscripciones (SUB-1 / CLYP-333).
 *
 * INVARIANTE: todo monto se guarda como entero en la unidad mínima de SU moneda
 * (céntimos de Bs o de USD). Nunca como float, nunca en unidades mayores.
 *
 * Las conversiones básicas (`toMinor` / `fromMinor`) y el transformer de las
 * columnas `bigint` obligatorias ya existen en nómina y los reusamos: el dinero
 * del proyecto se comporta igual en todos los módulos.
 */
import { moneyTransformer } from '../payroll/payroll-money.util';

export {
  toMinor,
  fromMinor,
  moneyTransformer,
} from '../payroll/payroll-money.util';

/** Moneda de la caja del salón y de los pagos móviles. */
export const CURRENCY_VES = 'VES';

/** Moneda de la base de precio de los planes (Binance / PayPal cobran en ella). */
export const CURRENCY_USD = 'USD';

export const SUBSCRIPTION_CURRENCIES = [CURRENCY_VES, CURRENCY_USD];

/**
 * Transformer para columnas `bigint` de dinero OPCIONALES.
 *
 * `moneyTransformer` normaliza null a 0, que es correcto donde el monto siempre
 * existe. Aquí no: un reporte en Bs no tiene monto en USD y viceversa, y ese
 * null significa "no aplica", no "cero".
 */
export const nullableMoneyTransformer = {
  to: (v: number | null | undefined): number | null => v ?? null,
  from: (v: string | number | null): number | null =>
    v == null ? null : moneyTransformer.from(v),
};

/**
 * Transformer para la tasa `decimal(18,4)`. mysql2 devuelve DECIMAL como
 * string; el dominio la usa como número.
 */
export const rateTransformer = {
  to: (v: number | null | undefined): number | null => v ?? null,
  from: (v: string | number | null): number | null =>
    v == null ? null : typeof v === 'string' ? parseFloat(v) : Number(v),
};

/**
 * Precio en centavos de USD → céntimos de Bs a una tasa dada (Bs por 1 USD).
 *
 * Redondea al céntimo: el monto que se le muestra al tenant es exactamente el
 * que se congela en el reporte y el que se compara contra el pago recibido.
 */
export function usdMinorToVesMinor(usdMinor: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Tasa inválida para cotizar: ${String(rate)}`);
  }
  return Math.round((usdMinor || 0) * rate);
}
