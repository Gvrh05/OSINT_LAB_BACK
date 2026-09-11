import { Injectable } from '@nestjs/common';
import { OijService } from '../oij/oij.service';

interface GlobalSearchOptions {
  q?: string;
  source?: string;
  province?: string;
  year?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly oijService: OijService) {}

  async search(options: GlobalSearchOptions) {
    const selectedSource = (options.source ?? 'all').toLowerCase();

    if (!['all', 'oij'].includes(selectedSource)) {
      return {
        query: options.q?.trim() ?? '',
        total: 0,
        page: 1,
        limit: options.limit ?? 20,
        totalPages: 1,
        sources: [],
        results: [],
      };
    }

    const response = await this.oijService.search({
      q: options.q,
      province: options.province,
      year: options.year,
      page: options.page,
      limit: options.limit,
    });

    return {
      ...response,
      sources: response.total > 0 ? ['OIJ'] : [],
      results: response.results.map((record) => ({
        ...record,
        source: 'OIJ',
        institution: 'Organismo de Investigación Judicial',
        dataset: 'Estadísticas Policiales',
      })),
    };
  }
}
