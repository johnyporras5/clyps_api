import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CobrixConfig } from './cobrix.config';

/** Lo que hay que mandarle a Cobrix para emitir el documento de cobro. */
export interface CobrixInvoiceParams {
  /** Cédula o RIF: Cobrix resuelve al cliente por identidad fiscal. */
  identification: string;
  /**
   * Nuestra referencia estable. Viaja como `provider_id`, vuelve tal cual en el
   * webhook y es lo que casa el cobro con la factura de este tenant.
   */
  providerReference: string;
  /**
   * Monto en unidades MAYORES y en la moneda de la cuenta de Cobrix: 22259.77
   * son veintidós mil bolívares. Ojo, la API de integraciones usa unidades
   * menores; esta no.
   */
  amount: number;
  name: string;
  email: string;
  /** YYYY-MM-DD. */
  dueDate: string;
}

export interface CobrixInvoiceResult {
  invoiceId: string | null;
  paymentLink: string;
  raw: Record<string, unknown>;
}

/**
 * Cliente de la API de Cobrix (SUB-10).
 *
 * Usa la API PÚBLICA de documentos (`/v1/invoices`), no la de integraciones:
 * esta pide solo Bearer —sin firma HMAC por petición—, resuelve al cliente sola
 * por identidad fiscal y devuelve el enlace de pago en la misma respuesta, que
 * es exactamente lo que necesita un cobro mensual suelto. La de integraciones
 * existe para sincronizar cartera y aplicar pagos parciales, cosas que aquí no
 * hacen falta.
 *
 * Solo habla con su API: no toca la base ni sabe nada de suscripciones, para
 * que el dueño del flujo siga siendo el servicio de facturas.
 */
@Injectable()
export class CobrixClient {
  private readonly logger = new Logger(CobrixClient.name);

  constructor(private readonly config: CobrixConfig) {}

  /**
   * Emite la factura y devuelve su enlace de pago.
   *
   * `x-idempotency` va con nuestra referencia: si la respuesta se pierde y se
   * reintenta, Cobrix devuelve la MISMA factura en vez de emitir otra.
   */
  async createInvoice(
    params: CobrixInvoiceParams,
  ): Promise<CobrixInvoiceResult> {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw this.unavailable('COBRIX_NOT_CONFIGURED');

    let response: Response;
    try {
      response = await fetch(`${this.config.apiUrl}/v1/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'x-idempotency': params.providerReference,
        },
        body: JSON.stringify({
          reference: params.identification,
          provider: this.config.provider,
          provider_id: params.providerReference,
          amount: params.amount,
          name: params.name,
          email: params.email,
          due_date: params.dueDate,
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      // Timeout o red caída. No hay factura emitida, así que se puede
      // reintentar sin duplicar nada.
      this.logger.error(
        `[cobrix] No se pudo emitir la factura ${params.providerReference}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      throw this.unavailable('COBRIX_UNAVAILABLE');
    }

    const body = await this.readJson(response);

    if (!response.ok) {
      this.logger.error(
        `[cobrix] Factura ${params.providerReference} rechazada con ${response.status}: ${JSON.stringify(
          body,
        ).slice(0, 500)}`,
      );
      throw this.unavailable('COBRIX_REJECTED');
    }

    // El enlace SIEMPRE sale de la respuesta: su documentación pide
    // explícitamente no armar el dominio a mano.
    const paymentLink =
      pickString(body, ['payment', 'payment_link']) ??
      pickString(body, ['payment_link']) ??
      pickString(body, ['data', 'payment', 'payment_link']) ??
      pickString(body, ['checkoutUrl']);

    if (!paymentLink) {
      this.logger.error(
        `[cobrix] La factura ${params.providerReference} se creó pero la respuesta no trae payment_link: ${JSON.stringify(
          body,
        ).slice(0, 500)}`,
      );
      throw this.unavailable('COBRIX_NO_LINK');
    }

    return {
      invoiceId:
        pickString(body, ['id']) ??
        pickString(body, ['invoice', 'id']) ??
        pickString(body, ['data', 'invoice', 'invoiceId']),
      paymentLink,
      raw: body,
    };
  }

  /**
   * Anula el documento de cobro en Cobrix.
   *
   * NUNCA lanza: quien la llama es un webhook, y que Cobrix no conteste no
   * puede impedir que nosotros demos ese cobro por muerto. Devuelve si la
   * anulación quedó confirmada del OTRO lado — un `false` significa que la
   * factura puede seguir viva en su panel y hay que cerrarla a mano.
   *
   * Un 404 cuenta como anulada: si allá ya no existe, no hay nada que cerrar.
   */
  async cancelInvoice(invoiceId: string): Promise<boolean> {
    const apiKey = this.config.apiKey;
    if (!apiKey) return false;

    const url = `${this.config.apiUrl}${this.config.invoiceCancelPath.replace(
      '{id}',
      encodeURIComponent(invoiceId),
    )}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: this.config.invoiceCancelMethod,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `[cobrix] No se pudo anular la factura ${invoiceId}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return false;
    }

    if (response.ok || response.status === 404) return true;

    const body = await this.readJson(response);
    this.logger.error(
      `[cobrix] Anulación de la factura ${invoiceId} rechazada con ${response.status}: ${JSON.stringify(
        body,
      ).slice(0, 500)}`,
    );
    return false;
  }

  /**
   * 503 con un código que el front pueda distinguir. Cualquier fallo aquí deja
   * al dueño con el reporte manual de siempre, que no depende de Cobrix.
   */
  private unavailable(code: string): ServiceUnavailableException {
    return new ServiceUnavailableException({
      statusCode: 503,
      code,
      message: 'El pago automático no está disponible ahora. Intenta de nuevo.',
    });
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = await response.json();
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}

/**
 * Navega un objeto por una ruta de claves y devuelve el valor solo si hay algo
 * utilizable. Cualquier tramo ausente da null en vez de romper: el contrato de
 * Cobrix es aditivo y pide tolerar campos desconocidos y nulos.
 */
function pickString(
  source: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === 'string' && current.trim()) return current.trim();
  if (typeof current === 'number' && Number.isFinite(current))
    return String(current);
  return null;
}
