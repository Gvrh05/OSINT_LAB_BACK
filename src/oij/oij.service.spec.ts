import { OijService } from './oij.service';

describe('OijService', () => {
  const csv = [
    'ROBO,FORZADURA,2026-01-01,VIVIENDA,CASA [VIVIENDA],Mayor de edad,,COSTA RICA,GUANACASTE,NICOYA,NOSARA',
    'HURTO,DESCUIDO,2026-02-01,PERSONA,PEATON [PERSONA],Mayor de edad,,COSTA RICA,SAN JOSE,SAN JOSE,CARMEN',
  ].join('\n');

  beforeEach(() => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(Buffer.from(csv, 'utf8'), { status: 200 }),
      );
  });

  afterEach(() => jest.restoreAllMocks());

  it('interpreta correctamente el CSV oficial sin encabezados', async () => {
    const service = new OijService();
    const result = await service.search({ q: 'Nicoya', page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.results[0]).toMatchObject({
      delito: 'ROBO',
      provincia: 'GUANACASTE',
      canton: 'NICOYA',
      distrito: 'NOSARA',
    });
  });

  it('genera filtros desde los valores del archivo', async () => {
    const service = new OijService();
    const filters = await service.getFilters();

    expect(filters.years).toEqual([2026, 2025, 2024, 2023]);
    expect(filters.provinces).toEqual(['GUANACASTE', 'SAN JOSE']);
    expect(filters.crimes).toEqual(['HURTO', 'ROBO']);
  });
});
