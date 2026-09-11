import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): Record<string, unknown> {
    return {
      proyecto: 'OSINT Costa Rica - Backend',
      descripcion:
        'Integra fuentes OSINT de Costa Rica y expone datos normalizados para el frontend.',
      rutas: {
        root: 'GET /api',
        tse: {
          download: 'POST /api/tse/download  (body: { filePath?: string })',
          status: 'GET /api/tse/status',
          data: 'GET /api/tse/data?page=1&limit=50',
          search: 'GET /api/tse/search?q=nombre+o+cedula&page=1&limit=50',
          stats: 'GET /api/tse/stats',
          cantones: 'GET /api/tse/stats/cantones?provincia=SAN JOSE',
          distritos: 'GET /api/tse/distritos-electorales',
        },
      },
      fuenteTSE:
        'Padrón Nacional Electoral - https://www.tse.go.cr/descarga_padron.html',
    };
  }
}
