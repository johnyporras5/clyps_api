import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CitiesResponse, CityResult } from './dto/city-result.dto';
import { fetchMapboxPlaces } from './mapbox.client';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const DEFAULT_LANG = 'es';
const DEFAULT_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

interface CacheEntry {
  expiresAt: number;
  results: CityResult[];
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private missingTokenWarned = false;

  constructor(private readonly config: ConfigService) {}

  private get token(): string {
    return this.config.get<string>('MAPBOX_TOKEN')?.trim() ?? '';
  }

  private get timeoutMs(): number {
    const raw = Number(this.config.get<string>('MAPBOX_TIMEOUT_MS'));
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_TIMEOUT_MS;
  }

  async searchCities(params: {
    q?: string;
    limit?: number;
    lang?: string;
  }): Promise<CitiesResponse> {
    const q = (params.q ?? '').trim();
    const limit = clampLimit(params.limit);
    const lang = normalizeLang(params.lang);

    if (q.length < MIN_QUERY_LENGTH || q.length > MAX_QUERY_LENGTH) {
      return { results: [] };
    }

    const token = this.token;
    if (!token) {
      if (!this.missingTokenWarned) {
        this.missingTokenWarned = true;
        this.logger.warn(
          'MAPBOX_TOKEN no está configurado: el autocompletado de ciudad ' +
            'devuelve vacío y el campo queda como texto libre.',
        );
      }
      return { results: [] };
    }

    const key = cacheKey(q, limit, lang);
    const cached = this.readCache(key);
    if (cached) return { results: cached };

    try {
      const payload = await fetchMapboxPlaces({
        q,
        limit,
        lang,
        token,
        timeoutMs: this.timeoutMs,
      });
      const results = mapFeatures(payload);
      this.writeCache(key, results);
      return { results };
    } catch (error) {
      this.logger.error(
        `Geocodificación fallida para "${q}" (${lang}): ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return { results: [] };
    }
  }

  private readCache(key: string): CityResult[] | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return hit.results;
  }

  private writeCache(key: string, results: CityResult[]): void {
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
  }
}

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function normalizeLang(lang?: string): string {
  const clean = (lang ?? '').trim();
  return /^[A-Za-z]{2}(-[A-Za-z]{2,4})?$/.test(clean)
    ? clean.toLowerCase()
    : DEFAULT_LANG;
}

function cacheKey(q: string, limit: number, lang: string): string {
  const normalized = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
  return `${normalized}|${limit}|${lang}`;
}

function mapFeatures(payload: unknown): CityResult[] {
  const features = isRecord(payload) ? payload.features : undefined;
  if (!Array.isArray(features)) return [];

  const results: CityResult[] = [];
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    const id = asString(feature.id);
    const name = asString(feature.text);
    const fullName = asString(feature.place_name);
    if (!id || !name || !fullName) continue;
    results.push({ id, name, fullName, countryCode: countryCodeOf(feature) });
  }
  return results;
}

function countryCodeOf(feature: Record<string, unknown>): string | null {
  const context = feature.context;
  if (Array.isArray(context)) {
    for (const item of context) {
      if (!isRecord(item)) continue;
      if (!asString(item.id)?.startsWith('country')) continue;
      const code = asString(item.short_code);
      if (code) return code.toUpperCase();
    }
  }
  const properties = feature.properties;
  const fallback = isRecord(properties)
    ? asString(properties.short_code)
    : undefined;
  return fallback ? fallback.toUpperCase() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
