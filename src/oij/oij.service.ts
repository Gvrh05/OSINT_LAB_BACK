import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { parse } from 'csv-parse/sync';

export interface OijRecord {
  id: string;

  delito: string;
  subDelito: string;

  fecha: string;
  hora: string;

  victima: string;
  subVictima: string;

  edad: string;
  sexo: string;
  nacionalidad: string;

  provincia: string;
  canton: string;
  distrito: string;
}

const OIJ_COLUMNS = [
  'Delito',
  'SubDelito',
  'Fecha',
  'Victima',
  'SubVictima',
  'Edad',
  'Sexo',
  'Nacionalidad',
  'Provincia',
  'Canton',
  'Distrito',
] as const;

interface SearchOptions {
  q?: string;
  province?: string;
  canton?: string;
  crime?: string;
  year?: string;

  page?: number;
  limit?: number;
}

interface StatisticsOptions {
  groupBy?: 'year' | 'month' | 'province' | 'crime';
  year?: string;
  month?: string;
  province?: string;
  crime?: string;
}

@Injectable()
export class OijService {
  private readonly availableYears = [2026, 2025, 2024, 2023];
  private readonly sourceBaseUrl =
    'https://pjcrdatosabiertos.blob.core.windows.net/datosabiertos/PJCROD_POLICIALES_V1/PJCROD_POLICIALES_V1';

  private readonly cache = new Map<number, OijRecord[]>();
  private readonly cacheDates = new Map<number, Date>();
  private readonly loadingPromises = new Map<number, Promise<OijRecord[]>>();

  private readonly cacheDuration = 30 * 60 * 1000;

  /**
   * Estado general del módulo.
   */
  getStatus() {
    return {
      source: 'OIJ',
      institution: 'Organismo de Investigación Judicial',
      dataset: 'Estadísticas Policiales',
      years: this.availableYears,
      status: 'active',
      sourceUrl: this.getSourceUrl(this.availableYears[0]),
      cachedYears: [...this.cache.keys()],
      loadedAt: this.cacheDates.get(this.availableYears[0]) ?? null,
    };
  }

  /**
   * Descarga y procesa el CSV oficial.
   */
  private async loadData(year = this.availableYears[0]): Promise<OijRecord[]> {
    const validYear = this.resolveYear(year);
    if (this.isCacheValid(validYear)) {
      return this.cache.get(validYear)!;
    }

    const pending = this.loadingPromises.get(validYear);
    if (pending) {
      return pending;
    }

    const loadingPromise = this.fetchAndNormalize(validYear);
    this.loadingPromises.set(validYear, loadingPromise);

    try {
      return await loadingPromise;
    } finally {
      this.loadingPromises.delete(validYear);
    }
  }

  private async fetchAndNormalize(year: number): Promise<OijRecord[]> {
    try {
      const response = await fetch(this.getSourceUrl(year), {
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`La fuente respondió con HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      const buffer = Buffer.from(arrayBuffer);

      const csvContent = this.decodeCsv(buffer);

      const delimiter = this.detectDelimiter(csvContent);

      const rows = parse(csvContent, {
        columns: false,
        skip_empty_lines: true,
        delimiter,
        relax_column_count: true,
        trim: true,
        bom: true,
      });

      const rawRecords = this.rowsToRecords(rows);

      const records = rawRecords.map((row, index) =>
        this.normalizeRecord(row, index, year),
      );

      this.cache.set(year, records);
      this.cacheDates.set(year, new Date());

      return records;
    } catch (error) {
      console.error('Error cargando datos del OIJ:', error);

      /*
       * Si ya teníamos datos en memoria y la fuente externa
       * falla temporalmente, usamos la última copia disponible.
       */
      const staleCache = this.cache.get(year);
      if (staleCache) {
        return staleCache;
      }

      throw new ServiceUnavailableException(
        'No fue posible consultar la fuente pública del OIJ.',
      );
    }
  }

  /**
   * El CSV 2026 se publica sin encabezados. También se admiten encabezados
   * si la institución los incorpora en una versión futura.
   */
  private rowsToRecords(rows: string[][]): Record<string, string>[] {
    if (rows.length === 0) return [];

    const firstRow = rows[0].map((value) => this.normalizeText(value));
    const hasHeaders =
      firstRow.includes('delito') &&
      firstRow.includes('provincia') &&
      firstRow.includes('canton');

    const headers = hasHeaders
      ? rows[0].map((value) => value.trim())
      : [...OIJ_COLUMNS];
    const dataRows = hasHeaders ? rows.slice(1) : rows;

    return dataRows.map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? '']),
      ),
    );
  }

  /**
   * Comprueba si todavía podemos utilizar la copia en memoria.
   */
  private isCacheValid(year: number): boolean {
    const cached = this.cache.get(year);
    const cacheDate = this.cacheDates.get(year);
    if (!cached || !cacheDate) {
      return false;
    }

    const elapsed = Date.now() - cacheDate.getTime();

    return elapsed < this.cacheDuration;
  }

  /**
   * El portal puede entregar archivos con codificaciones
   * distintas de UTF-8.
   */
  private decodeCsv(buffer: Buffer): string {
    // UTF-8 con BOM
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      return new TextDecoder('utf-8').decode(buffer);
    }

    // UTF-16 LE con BOM
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buffer);
    }

    // Detectar UTF-16 LE aunque no tenga BOM.
    // Si hay muchos bytes nulos, probablemente es UTF-16.
    const sampleLength = Math.min(buffer.length, 200);
    let nullBytes = 0;

    for (let i = 0; i < sampleLength; i++) {
      if (buffer[i] === 0x00) {
        nullBytes++;
      }
    }

    if (nullBytes > sampleLength * 0.1) {
      return new TextDecoder('utf-16le').decode(buffer);
    }

    // Intentar UTF-8 normal
    try {
      return new TextDecoder('utf-8', {
        fatal: true,
      }).decode(buffer);
    } catch {
      // Último recurso para archivos Windows/Latin
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  /**
   * Detecta si el CSV utiliza coma, punto y coma o tabulación.
   */
  private detectDelimiter(content: string): string {
    const firstLine = content.split(/\r?\n/).find((line) => line.trim()) ?? '';

    const commas = (firstLine.match(/,/g) ?? []).length;
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    const tabs = (firstLine.match(/\t/g) ?? []).length;

    if (semicolons > commas && semicolons > tabs) {
      return ';';
    }

    if (tabs > commas && tabs > semicolons) {
      return '\t';
    }

    return ',';
  }

  /**
   * Convierte las columnas originales del Poder Judicial
   * al modelo interno de nuestra aplicación.
   */
  private normalizeRecord(
    row: Record<string, string>,
    index: number,
    year: number,
  ): OijRecord {
    return {
      id: `OIJ-${year}-${index + 1}`,

      delito: this.getField(row, 'Delito'),
      subDelito: this.getField(row, 'SubDelito'),

      fecha: this.getField(row, 'Fecha'),
      hora: this.getField(row, 'Hora'),

      victima: this.getField(row, 'Victima'),
      subVictima: this.getField(row, 'SubVictima'),

      edad: this.getField(row, 'Edad'),
      sexo: this.getField(row, 'Sexo'),

      nacionalidad: this.getField(row, 'Nacionalidad'),

      provincia: this.getField(row, 'Provincia'),
      canton: this.getField(row, 'Canton'),
      distrito: this.getField(row, 'Distrito'),
    };
  }

  /**
   * Permite tolerar pequeñas diferencias en los nombres
   * de las columnas.
   */
  private getField(row: Record<string, string>, field: string): string {
    const wanted = this.normalizeText(field);

    const foundKey = Object.keys(row).find(
      (key) => this.normalizeText(key) === wanted,
    );

    if (!foundKey) {
      return '';
    }

    return String(row[foundKey] ?? '').trim();
  }

  /**
   * Normaliza texto para búsquedas:
   *
   * Informática -> informatica
   * GUANACASTE -> guanacaste
   */
  private normalizeText(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Buscador principal.
   */
  async search(options: SearchOptions) {
    const year = this.resolveYear(options.year);
    const records = await this.loadData(year);

    const query = this.normalizeText(options.q ?? '');

    const province = this.normalizeText(options.province ?? '');

    const canton = this.normalizeText(options.canton ?? '');

    const crime = this.normalizeText(options.crime ?? '');

    const requestedPage = Number.isFinite(options.page)
      ? Math.trunc(options.page!)
      : 1;
    const requestedLimit = Number.isFinite(options.limit)
      ? Math.trunc(options.limit!)
      : 20;

    const page = Math.max(requestedPage, 1);

    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const filtered = records.filter((record) => {
      if (province && this.normalizeText(record.provincia) !== province) {
        return false;
      }

      if (canton && this.normalizeText(record.canton) !== canton) {
        return false;
      }

      if (crime && !this.normalizeText(record.delito).includes(crime)) {
        return false;
      }

      if (!record.fecha.startsWith(`${year}-`)) {
        return false;
      }

      if (!query) {
        return true;
      }

      /*
       * La búsqueda no se limita al delito.
       * Puede encontrar provincia, cantón, distrito,
       * víctima, nacionalidad, etc.
       */
      const searchableText = this.normalizeText(
        [
          record.delito,
          record.subDelito,
          record.fecha,
          record.hora,
          record.victima,
          record.subVictima,
          record.edad,
          record.sexo,
          record.nacionalidad,
          record.provincia,
          record.canton,
          record.distrito,
        ].join(' '),
      );

      return searchableText.includes(query);
    });

    const start = (page - 1) * limit;

    const results = filtered.slice(start, start + limit);

    return {
      query: options.q?.trim() ?? '',
      total: filtered.length,
      page,
      limit,
      totalPages: Math.max(Math.ceil(filtered.length / limit), 1),
      results,
    };
  }

  /**
   * Resumen estadístico.
   */
  async getSummary(yearValue?: string) {
    const year = this.resolveYear(yearValue);
    const records = await this.loadData(year);

    const officialProvinces = new Set([
      'SAN JOSE',
      'ALAJUELA',
      'CARTAGO',
      'HEREDIA',
      'GUANACASTE',
      'PUNTARENAS',
      'LIMON',
    ]);

    const provinces = new Set(
      records
        .map((record) => record.provincia)
        .filter((province) =>
          officialProvinces.has(this.normalizeText(province).toUpperCase()),
        ),
    );

    const cantons = new Set(
      records
        .filter((record) =>
          officialProvinces.has(
            this.normalizeText(record.provincia).toUpperCase(),
          ),
        )
        .map((record) => `${record.provincia}|${record.canton}`)
        .filter((value) => !value.endsWith('|')),
    );

    const crimes = this.countBy(
      records.map((record) => record.delito).filter(Boolean),
    );

    const mostFrequentCrime = crimes.length > 0 ? crimes[0].name : undefined;

    return {
      totalRecords: records.length,
      year,
      totalProvinces: provinces.size,
      totalCantons: cantons.size,
      mostFrequentCrime,
      lastUpdated: this.cacheDates.get(year)?.toISOString() ?? null,
    };
  }

  /**
   * Opciones para los filtros del frontend.
   */
  async getFilters() {
    const records = await this.loadData();

    const officialProvinces = new Set([
      'SAN JOSE',
      'ALAJUELA',
      'CARTAGO',
      'HEREDIA',
      'GUANACASTE',
      'PUNTARENAS',
      'LIMON',
    ]);

    const provinces = [
      ...new Set(
        records
          .map((record) => record.provincia)
          .filter((province) =>
            officialProvinces.has(this.normalizeText(province).toUpperCase()),
          ),
      ),
    ].sort();

    const crimes = [
      ...new Set(records.map((record) => record.delito).filter(Boolean)),
    ].sort();

    const cantons = [
      ...new Set(records.map((record) => record.canton).filter(Boolean)),
    ].sort();

    const years = this.availableYears;

    return {
      years,
      provinces,
      cantons,
      crimes,
    };
  }

  async getTrends(yearValue?: string) {
    const records = await this.loadData(this.resolveYear(yearValue));
    const labels = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const totals = Array.from({ length: 12 }, () => 0);

    for (const record of records) {
      const match = /^\d{4}-(\d{2})-\d{2}$/.exec(record.fecha);
      if (!match) continue;
      const month = Number(match[1]) - 1;
      if (month >= 0 && month < 12) totals[month]++;
    }

    return totals.map((value, index) => ({ label: labels[index], value }));
  }

  /** Estadísticas agrupadas y filtradas para los gráficos del frontend. */
  async getStatistics(options: StatisticsOptions) {
    const records = options.year
      ? await this.loadData(this.resolveYear(options.year))
      : (
          await Promise.all(
            this.availableYears.map((year) => this.loadData(year)),
          )
        ).flat();
    const groupBy = options.groupBy ?? 'month';
    const province = this.normalizeText(options.province ?? '');
    const crime = this.normalizeText(options.crime ?? '');
    const month = options.month?.padStart(2, '0') ?? '';

    const filtered = records.filter((record) => {
      if (options.year && !record.fecha.startsWith(`${options.year}-`))
        return false;
      if (month && record.fecha.slice(5, 7) !== month) return false;
      if (province && this.normalizeText(record.provincia) !== province)
        return false;
      if (crime && this.normalizeText(record.delito) !== crime) return false;
      return true;
    });

    const monthNames = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    const values = filtered.map((record) => {
      if (groupBy === 'year') return record.fecha.slice(0, 4) || 'Sin año';
      if (groupBy === 'province') return record.provincia || 'Sin provincia';
      if (groupBy === 'crime') return record.delito || 'Sin delito';
      const monthIndex = Number(record.fecha.slice(5, 7)) - 1;
      return monthNames[monthIndex] ?? 'Sin mes';
    });

    let items = this.countBy(values);
    if (groupBy === 'month') {
      items = monthNames
        .map((name) => ({
          name,
          total: items.find((item) => item.name === name)?.total ?? 0,
        }))
        .filter((item) => item.total > 0);
    }

    return {
      groupBy,
      total: filtered.length,
      filters: {
        year: options.year ?? '',
        month: options.month ?? '',
        province: options.province ?? '',
        crime: options.crime ?? '',
      },
      items: items.map((item) => ({
        label: item.name,
        value: item.total,
        percentage:
          filtered.length > 0
            ? Number(((item.total / filtered.length) * 100).toFixed(2))
            : 0,
      })),
    };
  }

  /**
   * Delitos agrupados por cantidad.
   */
  async getCrimes(yearValue?: string) {
    const records = await this.loadData(this.resolveYear(yearValue));

    return this.countBy(
      records.map((record) => record.delito).filter(Boolean),
    ).map((item) => ({
      crime: item.name,
      total: item.total,
    }));
  }

  /**
   * Registros agrupados por provincia.
   */
  async getLocations(yearValue?: string) {
    const records = await this.loadData(this.resolveYear(yearValue));

    return this.countBy(
      records.map((record) => record.provincia).filter(Boolean),
    );
  }

  /**
   * Utilidad para contar valores.
   */
  private countBy(values: string[]) {
    const counts = new Map<string, number>();

    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([name, total]) => ({
        name,
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private getSourceUrl(year: number): string {
    return `${this.sourceBaseUrl}-${year}.csv`;
  }

  private resolveYear(value?: string | number): number {
    const year = Number(value ?? this.availableYears[0]);
    return this.availableYears.includes(year) ? year : this.availableYears[0];
  }
}
