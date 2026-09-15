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
  /**
   * La cédula/RIF con la que ya se le facturó, si existe (CLYP-343).
   *
   * Es el ÚNICO campo de este DTO que depende del tenant: el resto son nuestras
   * cuentas de cobro. Viaja aquí y no en un endpoint aparte porque lo consume
   * la misma pantalla y en el mismo momento — pedirlo por separado sería una
   * llamada más para un solo string.
   *
   * `null` = nunca facturó y hay que preguntársela.
   */
  payerIdentification: string | null;
  /**
   * Hay un documento de cobro VIVO, todavía sin pagar ni vencer.
   *
   * La pantalla lo necesita para no ofrecerle corregir la cédula: cambiarla
   * obliga a anular ese documento en Cobrix y emitir otro, y nadie sabe si el
   * dueño ya lo pagó —la confirmación puede tardar—. Estaríamos cancelando la
   * factura a la que le acaba de entrar la plata.
   */
  hasOpenCheckout: boolean;
}
