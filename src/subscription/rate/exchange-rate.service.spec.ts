import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ExchangeRateService } from './exchange-rate.service';
import { httpGetText } from './http-client';

jest.mock('./http-client');

/**
 * Los casos de prueba del ticket SUB-2: scraping OK, timeout con fallback a la
 * otra página, y valor absurdo rechazado. La red se corta en `http-client`, que
 * es el único punto que sale a internet.
 */
const getMock = httpGetText as jest.MockedFunction<typeof httpGetText>;

function serviceWith(env: Record<string, string> = {}): ExchangeRateService {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new ExchangeRateService(config);
}

/** URL con la que se pidió la enésima página. */
function calledUrl(index: number): string {
  return String(getMock.mock.calls[index]?.[0]);
}

const DOLARAPI = JSON.stringify({ fuente: 'oficial', promedio: 794.9917 });
const ERAPI = JSON.stringify({ result: 'success', rates: { VES: 800 } });
const BCV_HTML =
  '<div id="dolar"><strong class="strong-tb">810,00000000</strong></div>';

describe('ExchangeRateService', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('scraping OK: devuelve la tasa de la fuente primaria', async () => {
    getMock.mockResolvedValueOnce(DOLARAPI);

    const result = await serviceWith().fetchRate();

    expect(result.rate).toBe(794.9917);
    expect(result.source).toBe('dolarapi');
    expect(result.type).toBe('oficial');
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(calledUrl(0)).toBe('https://ve.dolarapi.com/v1/dolares/oficial');
  });

  it('timeout de la primaria: reintenta y cae a la fuente de respaldo', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    // Dos intentos fallidos en dolarapi (SUBSCRIPTION_RATE_ATTEMPTS=2)...
    getMock
      .mockRejectedValueOnce(abort)
      .mockRejectedValueOnce(abort)
      // ...y la segunda página responde.
      .mockResolvedValueOnce(ERAPI);

    const result = await serviceWith().fetchRate();

    expect(result.rate).toBe(800);
    expect(result.source).toBe('erapi');
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(calledUrl(2)).toBe('https://open.er-api.com/v6/latest/USD');
  });

  it('valor absurdo: se descarta y se usa la siguiente fuente', async () => {
    // Fuera de la banda de cordura (max 100000): es un parseo roto, no una tasa.
    getMock
      .mockResolvedValueOnce(JSON.stringify({ promedio: 999999999 }))
      .mockResolvedValueOnce(ERAPI);

    const result = await serviceWith().fetchRate();

    expect(result.rate).toBe(800);
    expect(result.source).toBe('erapi');
    // La tasa absurda NO se reintenta: se pasa directo a la siguiente fuente.
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('una tasa en 0 o negativa también es absurda', () => {
    expect(serviceWith().isSane(0)).toBe(false);
    expect(serviceWith().isSane(-5)).toBe(false);
    expect(serviceWith().isSane(794.9917)).toBe(true);
  });

  it('si ninguna fuente responde, no se inventa una tasa: 503', async () => {
    getMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(serviceWith().fetchRate()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('el scraping del BCV se pide aceptando su certificado roto', async () => {
    getMock.mockResolvedValueOnce(BCV_HTML);

    const result = await serviceWith({
      SUBSCRIPTION_RATE_SOURCES: 'bcv',
    }).fetchRate();

    expect(result.rate).toBe(810);
    expect(result.source).toBe('bcv');
    expect(calledUrl(0)).toBe('https://www.bcv.org.ve/');
    expect(getMock.mock.calls[0]?.[1]).toMatchObject({ insecureTls: true });
  });

  it('la tasa la decide el entorno, no el dueño del salón', async () => {
    getMock.mockResolvedValueOnce(JSON.stringify({ promedio: 922.69121677 }));

    const result = await serviceWith({
      SUBSCRIPTION_RATE_TYPE: 'euro',
    }).fetchRate();

    expect(result.type).toBe('euro');
    expect(result.rate).toBe(922.69121677);
    expect(calledUrl(0)).toBe('https://ve.dolarapi.com/v1/euros/oficial');
  });

  it('el orden de las fuentes es configurable por entorno', async () => {
    getMock.mockResolvedValueOnce(ERAPI);

    const result = await serviceWith({
      SUBSCRIPTION_RATE_SOURCES: 'erapi,dolarapi',
    }).fetchRate();

    expect(result.source).toBe('erapi');
    expect(calledUrl(0)).toBe('https://open.er-api.com/v6/latest/USD');
  });
});
