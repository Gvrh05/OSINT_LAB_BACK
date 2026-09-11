import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORY_MAP } from './osm.constants';

export interface Canton {
  id: number;
  name: string;
}

export interface OsmMeta {
  source: string;
  providerUrl: string;
  retrievedAt: string;
  partial?: boolean;
  warnings?: string[];
}

export interface PoiFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | null;
  properties: {
    id: string;
    name: string;
    amenity: string;
    category: string;
  };
}

export interface PoiCollection {
  type: 'FeatureCollection';
  features: PoiFeature[];
  canton: Canton;
  meta: OsmMeta;
}

export interface CantonsResponse {
  data: Canton[];
  meta: OsmMeta;
}

export interface SummaryResponse {
  canton: Canton;
  data: Record<string, number>;
  meta: OsmMeta;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  remark?: string;
  elements?: OverpassElement[];
}

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const FETCH_TIMEOUT_MS = 60_000;
const FULL_RETRIES = 2;
const RETRY_GAP_MS = 3000;
const CANTONS_TTL_MS = 24 * 60 * 60 * 1000;
const POIS_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OsmService {
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly diskDir = join(process.cwd(), '.cache', 'osm');

  constructor() {
    this.loadFromDisk();
  }

  async getCantons(): Promise<CantonsResponse> {
    const cached = this.getCached<CantonsResponse>('cantons');
    if (cached) return cached;

    const query =
      '[out:json][timeout:60];area["ISO3166-1"="CR"][admin_level=2]->.cr;relation["boundary"="administrative"]["admin_level"="6"](area.cr);out tags;';
    const json = await this.runQuery(query);

    const cantons: Canton[] = (json.elements ?? [])
      .filter((e) => e.tags?.name)
      .sort((a, b) => a.tags!.name!.localeCompare(b.tags!.name!, 'es'))
      .map((e) => ({ id: e.id, name: e.tags!.name! }));

    const response: CantonsResponse = { data: cantons, meta: this.meta() };
    this.setCached('cantons', response, CANTONS_TTL_MS);
    return response;
  }

  async getPois(cantonId: number, categoryKey?: string): Promise<PoiCollection> {
    let canton: Canton | undefined;
    try {
      const cantons = await this.getCantons();
      canton = cantons.data.find((c) => c.id === cantonId);
    } catch {
      canton = undefined;
    }
    if (!canton) {
      throw new NotFoundException(
        `Cantón con id ${cantonId} no está en la lista de cantones de Costa Rica.`,
      );
    }

    const cacheKey = categoryKey ? `pois:${cantonId}:${categoryKey}` : `pois:${cantonId}:all`;
    const cached = this.getCached<PoiCollection>(cacheKey);
    if (cached) return cached;

    const values = categoryKey
      ? this.resolveCategoryValues(categoryKey)
      : this.allCategoryValues();
    const areaId = 3600000000 + cantonId;
    const regex = values.join('|');
    const query = `[out:json][timeout:120];area(${areaId})->.c;(node["amenity"~"${regex}"](area.c);way["amenity"~"${regex}"](area.c);relation["amenity"~"${regex}"](area.c););out center tags;`;
    const json = await this.runQuery(query);

    const features: PoiFeature[] = (json.elements ?? [])
      .map((e) => this.toFeature(e))
      .filter((f): f is PoiFeature => f.geometry !== null);

    const collection: PoiCollection = {
      type: 'FeatureCollection',
      features,
      canton,
      meta: this.meta(),
    };
    this.setCached(cacheKey, collection, POIS_TTL_MS);
    return collection;
  }

  async getSummary(cantonId: number): Promise<SummaryResponse> {
    const collection = await this.getPois(cantonId);
    const counts: Record<string, number> = {};
    for (const feature of collection.features) {
      const key = feature.properties.category;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return { canton: collection.canton, data: counts, meta: collection.meta };
  }

  private toFeature(e: OverpassElement): PoiFeature {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    return {
      type: 'Feature',
      geometry:
        lat !== undefined && lon !== undefined
          ? { type: 'Point', coordinates: [lon, lat] }
          : null,
      properties: {
        id: `${e.type}/${e.id}`,
        name: e.tags?.name ?? '(sin nombre)',
        amenity: e.tags?.amenity ?? '',
        category: this.categoryOf(e.tags?.amenity),
      },
    };
  }

  private categoryOf(amenity?: string): string {
    if (!amenity) return 'otros';
    for (const [key, values] of Object.entries(CATEGORY_MAP)) {
      if (values.includes(amenity)) return key;
    }
    return 'otros';
  }

  private resolveCategoryValues(key: string): string[] {
    const values = CATEGORY_MAP[key];
    if (!values) {
      throw new BadRequestException(
        `Categoría "${key}" desconocida. Válidas: ${Object.keys(CATEGORY_MAP).join(', ')}.`,
      );
    }
    return values;
  }

  private allCategoryValues(): string[] {
    return [...new Set(Object.values(CATEGORY_MAP).flat())];
  }

  private async runQuery(query: string): Promise<OverpassResponse> {
    let lastError: string | null = null;
    for (let pass = 0; pass < FULL_RETRIES; pass++) {
      for (const url of OVERPASS_ENDPOINTS) {
        try {
          return await this.runQueryAgainst(url, query);
        } catch (e) {
          lastError = this.errorMessage(e);
        }
      }
      if (pass < FULL_RETRIES - 1) {
        await this.delay(RETRY_GAP_MS * (pass + 1));
      }
    }
    throw new ServiceUnavailableException(
      lastError ?? 'Overpass API no disponible. Intente de nuevo más tarde.',
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async runQueryAgainst(url: string, query: string): Promise<OverpassResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'osint-lab/0.1 (proyecto academico OSINT Costa Rica)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException(`No se pudo contactar el endpoint ${url}.`);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `HTTP ${response.status} del endpoint ${url}.`,
      );
    }

    let json: OverpassResponse;
    try {
      json = (await response.json()) as OverpassResponse;
    } catch {
      throw new ServiceUnavailableException(
        `El endpoint ${url} devolvió una respuesta no válida.`,
      );
    }

    if (!Array.isArray(json.elements)) {
      throw new ServiceUnavailableException(
        `Overpass API no devolvió datos: ${json.remark ?? 'respuesta vacía'}`,
      );
    }
    return json;
  }

  private errorMessage(e: unknown): string {
    if (e instanceof HttpException) {
      const response = e.getResponse();
      if (typeof response === 'string') return response;
      const message = (response as { message?: string | string[] })?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
      return e.message;
    }
    return e instanceof Error ? e.message : 'Error desconocido';
  }

  private meta(): OsmMeta {
    return {
      source: 'OpenStreetMap vía Overpass API',
      providerUrl: OVERPASS_ENDPOINTS[0],
      retrievedAt: new Date().toISOString(),
    };
  }

  private setCached<T>(key: string, value: T, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
    try {
      if (!existsSync(this.diskDir)) mkdirSync(this.diskDir, { recursive: true });
      writeFileSync(
        join(this.diskDir, `${this.keyHash(key)}.json`),
        JSON.stringify({ key, value, expiresAt }),
        'utf8',
      );
    } catch {
      // la persistencia en disco es best-effort
    }
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as { value: T; expiresAt: number } | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.diskDir)) return;
      for (const file of readdirSync(this.diskDir)) {
        try {
          const parsed = JSON.parse(
            readFileSync(join(this.diskDir, file), 'utf8'),
          ) as { key: string; value: unknown; expiresAt: number };
          if (parsed.expiresAt > Date.now()) {
            this.cache.set(parsed.key, { value: parsed.value, expiresAt: parsed.expiresAt });
          }
        } catch {
          // archivo corrupto: se ignora
        }
      }
    } catch {
      // sin permisos o carpeta inexistente: se ignora
    }
  }

  private keyHash(key: string): string {
    return createHash('sha1').update(key).digest('hex');
  }
}