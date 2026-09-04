import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_METHODS, type PaymentMethod } from '../subscription.enums';

/**
 * Valores por defecto de la integración con Cobrix (SUB-10).
 *
 * La tolerancia de 300 s no es un gusto nuestro: es la ventana que documenta
 * Cobrix para el `t` de la firma del canal general. Bajarla parte la
 * integración con el reloj ligeramente corrido; subirla abre la puerta a
 * reenviar un webhook viejo capturado en el camino.
 */
export const COBRIX_DEFAULTS = {
  /**
   * URL base de la API. Apunta a SANDBOX a propósito: el ambiente lo decide
   * esta URL y NO el prefijo de la llave —las de sandbox también empiezan por
   * `cbx_live_`—, así que un despliegue sin configurar tiene que emitir
   * facturas de prueba, nunca cobros reales.
   *
   * Producción: https://api.cobrix.co/api
   */
  apiUrl: 'https://sandbox-api.cobrix.co/api',
  /** Valor del campo `provider`: de qué sistema nuestro viene el cobro. */
  provider: 'clyps',
  /** Moneda de la cuenta de Cobrix. Tiene que coincidir con la de su panel. */
  currency: 'VES',
  /** Espera máxima a su API. El dueño está mirando la pantalla. */
  requestTimeoutMs: 15_000,
  /** Vigencia del documento de cobro emitido. */
  invoiceTtlHours: 24,
  /** Ventana del timestamp firmado del canal general, en segundos. */
  toleranceSeconds: 300,
  /** Métodos que Cobrix concilia. El resto va a manual (SUB-4). */
  methods: ['pago_movil'] as PaymentMethod[],
  /** Cuánto se espera el webhook antes de escalar el reporte a manual. */
  waitHours: 6,
  /** Tope de reportes que escala una corrida del job. */
  sweepBatch: 200,
} as const;

/**
 * La configuración de Cobrix, leída del entorno en un solo sitio.
 *
 * `enabled` cuelga de que existan la LLAVE y el SECRETO, no de una bandera
 * aparte: sin llave no se puede emitir el documento de cobro y sin secreto no
 * se puede verificar una firma. Un entorno a medio configurar se comporta
 * exactamente como antes de SUB-10 —verificación 100% manual— en vez de fallar
 * por la mitad.
 */
@Injectable()
export class CobrixConfig {
  constructor(private readonly config: ConfigService) {}

  private str(key: string): string | undefined {
    const raw = this.config.get<string>(key)?.trim();
    return raw ? raw : undefined;
  }

  private num(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  // ---------------------------------------------------------------------------
  // API de facturas (`/v1/invoices`)
  // ---------------------------------------------------------------------------

  /**
   * ⚠️ El ambiente lo decide esta URL, no el prefijo de la llave. Apuntar
   * producción a la URL de sandbox emite facturas que nadie va a pagar, y al
   * revés cobra de verdad.
   */
  get apiUrl(): string {
    return (
      this.str('COBRIX_API_URL')?.replace(/\/+$/, '') ?? COBRIX_DEFAULTS.apiUrl
    );
  }

  get apiKey(): string | undefined {
    return this.str('COBRIX_API_KEY');
  }

  get provider(): string {
    return this.str('COBRIX_PROVIDER') ?? COBRIX_DEFAULTS.provider;
  }

  /**
   * Moneda en la que factura la cuenta de Cobrix. La API pública de facturas NO
   * lleva campo de moneda: manda solo un número, y Cobrix lo interpreta en la
   * moneda de la cuenta. Tiene que coincidir con la pestaña Moneda de su panel.
   */
  get currency(): string {
    return (
      this.str('COBRIX_CURRENCY')?.toUpperCase() ?? COBRIX_DEFAULTS.currency
    );
  }

  get requestTimeoutMs(): number {
    return this.num(
      'COBRIX_REQUEST_TIMEOUT_MS',
      COBRIX_DEFAULTS.requestTimeoutMs,
    );
  }

  get invoiceTtlHours(): number {
    return this.num(
      'COBRIX_INVOICE_TTL_HOURS',
      COBRIX_DEFAULTS.invoiceTtlHours,
    );
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Secreto del canal de DOCUMENTOS (`cobrix_invoice_v1`): el que confirma el
   * cobro con `invoice.paid`. Su firma es el HMAC del cuerpo crudo, sin
   * timestamp.
   */
  get webhookSecret(): string | undefined {
    return this.str('COBRIX_WEBHOOK_SECRET');
  }

  /**
   * Secreto del canal GENERAL, que es OTRO y tiene otra fórmula
   * (`t=…,v1=…` sobre `timestamp.cuerpo`). Se escucha solo para enterarnos de
   * que el dueño terminó de reportar su pago en el checkout de Cobrix.
   * Opcional: sin él, ese canal se rechaza y no pasa nada más.
   */
  get generalWebhookSecret(): string | undefined {
    return this.str('COBRIX_GENERAL_WEBHOOK_SECRET');
  }

  get toleranceSeconds(): number {
    return this.num(
      'COBRIX_WEBHOOK_TOLERANCE_SECONDS',
      COBRIX_DEFAULTS.toleranceSeconds,
    );
  }

  /**
   * Segmento secreto opcional de la ruta del webhook. Es cosmético —la firma es
   * lo que protege— pero evita que un escáner encuentre el endpoint.
   */
  get pathToken(): string | undefined {
    return this.str('COBRIX_WEBHOOK_PATH_TOKEN');
  }

  // ---------------------------------------------------------------------------
  // Alcance
  // ---------------------------------------------------------------------------

  /** Sin llave o sin secreto no hay conciliación automática posible. */
  get enabled(): boolean {
    if (this.config.get<string>('COBRIX_ENABLED')?.trim() === 'false')
      return false;
    return Boolean(this.apiKey) && Boolean(this.webhookSecret);
  }

  /** Métodos de pago que Cobrix concilia hoy. Los demás nacen `unsupported`. */
  get methods(): PaymentMethod[] {
    const raw = this.str('COBRIX_METHODS');
    if (!raw) return [...COBRIX_DEFAULTS.methods];
    const parsed = raw
      .split(',')
      .map((method) => method.trim())
      .filter((method): method is PaymentMethod =>
        (PAYMENT_METHODS as string[]).includes(method),
      );
    return parsed.length ? parsed : [...COBRIX_DEFAULTS.methods];
  }

  covers(method: PaymentMethod): boolean {
    return this.methods.includes(method);
  }

  /** Horas de espera del webhook antes de escalar el reporte a manual. */
  get waitHours(): number {
    return this.num('COBRIX_WEBHOOK_WAIT_HOURS', COBRIX_DEFAULTS.waitHours);
  }

  // ---------------------------------------------------------------------------
  // ⚠️ ANDAMIO DE PRUEBAS
  // ---------------------------------------------------------------------------

  /**
   * Monto fijo con el que se factura en vez del precio del plan, en unidades
   * MAYORES de la moneda de la cuenta (`COBRIX_TEST_AMOUNT=1` factura 1 Bs).
   *
   * Sirve para recorrer el circuito completo —enlace, pago real, conciliación,
   * webhook, activación— sin cobrarle a nadie el precio del plan. Es la única
   * forma de probarlo de verdad: el pago tiene que ocurrir en el banco.
   *
   * ⚠️ NO se apaga solo en producción, y es a propósito: probar contra Cobrix
   * exige la cuenta real. Lo que lo hace seguro es `COBRIX_TEST_COMPANY_IDS` y
   * que cada factura así emitida deje un WARN en el log.
   */
  get testAmount(): number | null {
    const raw = Number(this.config.get<string>('COBRIX_TEST_AMOUNT'));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  /**
   * A qué salones se les aplica el monto de prueba. Vacío = A TODOS, que es lo
   * que no quieres en producción: pon aquí el id de tu salón de pruebas y los
   * tenants reales seguirán pagando el precio del plan aunque te olvides de
   * quitar la variable.
   */
  get testCompanyIds(): number[] {
    const raw = this.str('COBRIX_TEST_COMPANY_IDS');
    if (!raw) return [];
    return raw
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  /**
   * El monto de prueba en unidades mínimas para este salón, o `null` si le toca
   * pagar el precio de verdad.
   */
  testAmountMinorFor(companyId: number): number | null {
    const amount = this.testAmount;
    if (amount === null) return null;

    const ids = this.testCompanyIds;
    if (ids.length && !ids.includes(companyId)) return null;

    return Math.round(amount * 100);
  }
}
