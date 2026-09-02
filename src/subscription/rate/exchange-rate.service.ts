import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RATE_DEFAULTS,
  RATE_SOURCES,
  isRateSourceId,
  isRateType,
  type RateSource,
  type RateSourceId,
  type RateType,
} from '../config/rate.config';
import { httpGetText } from './http-client';

/** Una tasa ya obtenida y validada, con su procedencia. */
export interface FetchedRate {
  /** Bs por 1 unidad de la moneda de `type` (1 USD o 1 EUR). */
  rate: number;
  type: RateType;
  source: RateSourceId;
  sourceLabel: string;
  fetchedAt: Date;
}

/**
 * Obtiene la tasa oficial del BCV del momento (SUB-2 / CLYP-334).
 *
 * Recorre las fuentes configuradas EN ORDEN y se queda con la primera que
 * responda un valor sano: si la primera página se cae o tarda, la siguiente
 * responde y el dueño igual puede pagar. Ver `rate.config.ts` para la URL y el
 * campo exacto de cada una.
 *
 * Nada se cachea a propósito: el criterio del ticket es "la tasa del momento en
 * que se abre el pago". Lo que sí se congela es la cotización, pero eso pasa al
 * reportar el pago (SUB-3), no aquí.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(private readonly config: ConfigService) {}

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------

  /**
   * Tipo de cambio que se le cobra al salón. Lo decide el desarrollador por
   * entorno (`SUBSCRIPTION_RATE_TYPE=oficial|euro`); el dueño solo ve el
   * monto resultante.
   */
  get rateType(): RateType {
    const raw = this.config.get<string>('SUBSCRIPTION_RATE_TYPE')?.trim();
    return isRateType(raw) ? raw : RATE_DEFAULTS.type;
  }

  /**
   * Orden de las fuentes ("dolarapi,erapi,bcv"). La primera es la primaria y las
   * demás son el respaldo. Los ids desconocidos se ignoran.
   */
  get sources(): RateSource[] {
    const raw = this.config.get<string>('SUBSCRIPTION_RATE_SOURCES')?.trim();
    const ids = raw
      ? raw
          .split(',')
          .map((id) => id.trim())
          .filter(isRateSourceId)
      : RATE_DEFAULTS.sources;
    const list = (ids.length ? ids : RATE_DEFAULTS.sources).map(
      (id) => RATE_SOURCES[id],
    );
    return list;
  }

  private num(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  get timeoutMs(): number {
    return this.num('SUBSCRIPTION_RATE_TIMEOUT_MS', RATE_DEFAULTS.timeoutMs);
  }

  get attempts(): number {
    return Math.floor(
      this.num('SUBSCRIPTION_RATE_ATTEMPTS', RATE_DEFAULTS.attempts),
    );
  }

  /** Banda de cordura: fuera de esto la tasa se descarta como absurda. */
  get bounds(): { min: number; max: number } {
    return {
      min: this.num('SUBSCRIPTION_RATE_MIN', RATE_DEFAULTS.minRate),
      max: this.num('SUBSCRIPTION_RATE_MAX', RATE_DEFAULTS.maxRate),
    };
  }

  // ---------------------------------------------------------------------------
  // Obtención
  // ---------------------------------------------------------------------------

  /**
   * Tasa del momento. Recorre las fuentes configuradas hasta que una responda
   * un valor sano; si ninguna lo hace, lanza 503 (no se inventa una tasa: mejor
   * que el dueño reintente a que pague un monto equivocado).
   */
  async fetchRate(type: RateType = this.rateType): Promise<FetchedRate> {
    const failures: string[] = [];

    for (const source of this.sources) {
      const url = source.url(type);
      // Una fuente que no publica este tipo de cambio no es un fallo: se salta.
      if (!url) continue;

      const rate = await this.fetchFromSource(source, type, url, failures);
      if (rate !== null) {
        return {
          rate,
          type,
          source: source.id,
          sourceLabel: source.label,
          fetchedAt: new Date(),
        };
      }
    }

    this.logger.error(
      `No se pudo obtener la tasa ${type}: ${failures.join(' | ')}`,
    );
    throw new ServiceUnavailableException(
      'No se pudo obtener la tasa del día. Intenta de nuevo en unos minutos.',
    );
  }

  /** Intenta una fuente con reintentos. null = agotó los intentos. */
  private async fetchFromSource(
    source: RateSource,
    type: RateType,
    url: string,
    failures: string[],
  ): Promise<number | null> {
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        const body = await httpGetText(url, {
          timeoutMs: this.timeoutMs,
          insecureTls: source.insecureTls,
        });
        const parsed = source.parse(body, type);
        if (parsed === null) {
          failures.push(`${source.id}: respuesta sin tasa`);
          // Parsear mal no se arregla reintentando: la página cambió de forma.
          return null;
        }
        if (!this.isSane(parsed)) {
          failures.push(`${source.id}: tasa absurda (${parsed})`);
          return null;
        }
        return parsed;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`${source.id} intento ${attempt}: ${reason}`);
        if (attempt < this.attempts) await delay(RATE_DEFAULTS.retryDelayMs);
      }
    }
    return null;
  }

  /**
   * Una tasa fuera de la banda es un error de parseo disfrazado (un 0, un año,
   * el número de una tabla vecina), no una tasa: se rechaza.
   */
  isSane(rate: number): boolean {
    const { min, max } = this.bounds;
    return Number.isFinite(rate) && rate >= min && rate <= max;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
