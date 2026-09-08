/**
 * A dónde paga el dueño (SUB-FE-1 / CLYP-343).
 *
 * Los datos viven en variables de entorno, no en base: son NUESTRAS cuentas de
 * cobro, no un dato del tenant, y cambiarlas es un despliegue, no un UPDATE.
 *
 * Un método sin datos cargados viaja en `null` y la pantalla NO lo ofrece: es
 * preferible mostrar dos métodos a mostrar tres y que uno mande el dinero a
 * ninguna parte.
 */

export interface PagoMovilInstructions {
  /** Teléfono que recibe. */
  phone: string;
  /** Banco receptor ("0102 - Banco de Venezuela"). */
  bank: string | null;
  /** Cédula o RIF del receptor. */
  identification: string | null;
  /** A nombre de quién está la cuenta. */
  holder: string | null;
}

export interface BinanceInstructions {
  /** Dirección de la wallet que recibe. */
  wallet: string;
  /** Red de la transferencia (BEP20, TRC20…). */
  network: string | null;
  /** Pay ID de Binance, si se prefiere ese camino. */
  payId: string | null;
}

export interface PayPalInstructions {
  email: string;
  /** Enlace de pago (paypal.me u otro). */
  link: string | null;
}

export interface PaymentInstructionsResponse {
  pagoMovil: PagoMovilInstructions | null;
  binance: BinanceInstructions | null;
  paypal: PayPalInstructions | null;
  /**
   * Cobrix está configurado: se le puede ofrecer el enlace de pago que concilia
   * solo, en vez de que reporte a mano.
   */
  cobrixEnabled: boolean;
}
