export interface MapboxPlacesQuery {
  q: string;
  limit: number;
  lang: string;
  token: string;
  timeoutMs: number;
}

const PLACES_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

export async function fetchMapboxPlaces(
  query: MapboxPlacesQuery,
): Promise<unknown> {
  const params = new URLSearchParams({
    types: 'place,locality,neighborhood',
    autocomplete: 'true',
    limit: String(query.limit),
    language: query.lang,
    access_token: query.token,
  });
  const url = `${PLACES_URL}/${encodeURIComponent(query.q)}.json?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), query.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
