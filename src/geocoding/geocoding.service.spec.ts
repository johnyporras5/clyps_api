import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';
import { fetchMapboxPlaces } from './mapbox.client';

jest.mock('./mapbox.client');

const fetchMock = fetchMapboxPlaces as jest.MockedFunction<
  typeof fetchMapboxPlaces
>;

function serviceWith(env: Record<string, string> = {}): GeocodingService {
  const values: Record<string, string> = { MAPBOX_TOKEN: 'pk.test', ...env };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new GeocodingService(config);
}

const BARQUISIMETO = {
  features: [
    {
      id: 'place.12345',
      text: 'Barquisimeto',
      place_name: 'Barquisimeto, Lara, Venezuela',
      context: [
        { id: 'region.987', short_code: 'VE-L', text: 'Lara' },
        { id: 'country.654', short_code: 've', text: 'Venezuela' },
      ],
    },
  ],
};

describe('GeocodingService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('mapea la respuesta de Mapbox al contrato propio', async () => {
    fetchMock.mockResolvedValueOnce(BARQUISIMETO);

    const { results } = await serviceWith().searchCities({ q: 'barquisimeto' });

    expect(results).toEqual([
      {
        id: 'place.12345',
        name: 'Barquisimeto',
        fullName: 'Barquisimeto, Lara, Venezuela',
        countryCode: 'VE',
      },
    ]);
    expect(results[0].name).not.toContain(',');
    expect(results[0].fullName).toContain('Venezuela');
  });

  it('usa los valores por defecto del contrato (limit 6, lang es)', async () => {
    fetchMock.mockResolvedValueOnce(BARQUISIMETO);

    await serviceWith().searchCities({ q: 'barquisimeto' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'barquisimeto', limit: 6, lang: 'es' }),
    );
  });

  it('q vacío o de menos de 2 caracteres: lista vacía sin tocar al proveedor', async () => {
    const service = serviceWith();

    expect(await service.searchCities({ q: '' })).toEqual({ results: [] });
    expect(await service.searchCities({ q: ' b ' })).toEqual({ results: [] });
    expect(await service.searchCities({})).toEqual({ results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un texto absurdamente largo no llega al proveedor', async () => {
    const results = await serviceWith().searchCities({ q: 'a'.repeat(121) });

    expect(results).toEqual({ results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la segunda consulta igual se sirve de caché', async () => {
    fetchMock.mockResolvedValueOnce(BARQUISIMETO);
    const service = serviceWith();

    const first = await service.searchCities({ q: 'Barquisimeto' });
    const second = await service.searchCities({ q: '  BARQUISIMETO ' });

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('otro limit o lang es otra entrada de caché', async () => {
    fetchMock.mockResolvedValue(BARQUISIMETO);
    const service = serviceWith();

    await service.searchCities({ q: 'valencia' });
    await service.searchCities({ q: 'valencia', limit: 3 });
    await service.searchCities({ q: 'valencia', lang: 'en' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('proveedor caído: 200 con lista vacía y el fallo no se cachea', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce(BARQUISIMETO);
    const service = serviceWith();

    expect(await service.searchCities({ q: 'barquisimeto' })).toEqual({
      results: [],
    });
    const retry = await service.searchCities({ q: 'barquisimeto' });
    expect(retry.results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sin MAPBOX_TOKEN: lista vacía sin salir a la red', async () => {
    const service = serviceWith({ MAPBOX_TOKEN: '' });

    expect(await service.searchCities({ q: 'barquisimeto' })).toEqual({
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin MAPBOX_TOKEN: avisa una sola vez por proceso', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = serviceWith({ MAPBOX_TOKEN: '' });

    await service.searchCities({ q: 'barquisimeto' });
    await service.searchCities({ q: 'valencia' });
    await service.searchCities({ q: 'maracay' });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('countryCode: cae a properties.short_code y si no hay, null', async () => {
    fetchMock.mockResolvedValueOnce({
      features: [
        {
          id: 'place.1',
          text: 'Caracas',
          place_name: 'Caracas, Venezuela',
          properties: { short_code: 've' },
        },
        {
          id: 'place.2',
          text: 'Nowhere',
          place_name: 'Nowhere',
          context: [{ id: 'region.1', short_code: 'XX-1' }],
        },
      ],
    });

    const { results } = await serviceWith().searchCities({ q: 'caracas' });

    expect(results.map((r) => r.countryCode)).toEqual(['VE', null]);
  });

  it('features rotos o payload inesperado: se descartan sin romper', async () => {
    fetchMock.mockResolvedValueOnce({
      features: [
        { id: 'place.1' },
        null,
        {
          id: 'place.2',
          text: 'Maracay',
          place_name: 'Maracay, Aragua, Venezuela',
        },
      ],
    });

    const { results } = await serviceWith().searchCities({ q: 'maracay' });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Maracay');
  });

  it('respuesta sin features: lista vacía', async () => {
    fetchMock.mockResolvedValueOnce({ message: 'Not Found' });

    expect(await serviceWith().searchCities({ q: 'zzzz' })).toEqual({
      results: [],
    });
  });

  it('limit fuera de rango se ajusta al tope de Mapbox', async () => {
    fetchMock.mockResolvedValue(BARQUISIMETO);

    await serviceWith().searchCities({ q: 'lara', limit: 99 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('lang inválido cae al idioma por defecto', async () => {
    fetchMock.mockResolvedValue(BARQUISIMETO);

    await serviceWith().searchCities({ q: 'lara', lang: 'no-es-un-idioma' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'es' }),
    );
  });
});
