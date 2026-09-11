import { Test } from '@nestjs/testing';
import AdmZip from 'adm-zip';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TseService } from './tse.service';

const PADRON_MOCK = [
  '101053316,104015, ,20280207,00000,LUCILA    ,PORRAS,AGUERO',
  '101240037,823001, ,20300204,00000,ANA MARIA,PEREZ,PEREZ',
  '105550001,101001, ,20290101,00001,JUAN     ,RODRIGUEZ,QUESADA',
  '201300001,201001, ,20270202,00002,MARIA    ,SOLANO,VARGAS',
].join('\n');

const DISTELEC_MOCK = [
  '101001,SAN JOSE,CENTRAL,HOSPITAL',
  '104015,SAN JOSE,PURISCAL,GRIFO ALTO',
  '201001,ALAJUELA,CENTRAL,ALAJUELA',
  '823001,CONSULADO,MEXICO,CIUDAD DE MEXICO',
].join('\n');

describe('TseService', () => {
  let service: TseService;
  let zipPath: string;

  beforeAll(() => {
    const zip = new AdmZip();
    zip.addFile('PADRON_COMPLETO.txt', Buffer.from(PADRON_MOCK, 'utf-8'));
    zip.addFile('distelec.txt', Buffer.from(DISTELEC_MOCK, 'utf-8'));
    zip.addFile('Leame.txt', Buffer.from('FORMATO DESCRIPCION', 'utf-8'));
    zipPath = path.join(os.tmpdir(), `tse_test_${Date.now()}.zip`);
    fs.writeFileSync(zipPath, zip.toBuffer());
  });

  afterAll(() => {
    fs.unlinkSync(zipPath);
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TseService],
    }).compile();
    service = module.get(TseService);
  });

  it('carga el padrón desde un zip local y expone metadatos', async () => {
    const meta = await service.downloadAndLoadPadron(zipPath);
    expect(meta.registros).toBe(4);
    expect(meta.archivo).toContain('PADRON');
    expect(meta.fuente).toContain('tse.go.cr');

    const status = service.getStatus();
    expect(status.cargado).toBe(true);
    expect(status.registros).toBe(4);
  });

  it('resuelve provincia, cantón y distrito desde DISTELEC', async () => {
    await service.downloadAndLoadPadron(zipPath);
    const pagina = service.getData(1, 4);
    const lucila = pagina.data.find((r) => r.cedula === '101053316');
    expect(lucila).toMatchObject({
      nombre: 'LUCILA',
      apellido1: 'PORRAS',
      apellido2: 'AGUERO',
      provincia: 'SAN JOSE',
      canton: 'PURISCAL',
      distrito: 'GRIFO ALTO',
    });

    const consultado = pagina.data.find((r) => r.cedula === '101240037');
    expect(consultado?.provincia).toBe('CONSULADO');
  });

  it('busca por cédula y por nombre completo', async () => {
    await service.downloadAndLoadPadron(zipPath);

    const porCedula = service.searchPadron('101240037', 1, 10);
    expect(porCedula.total).toBe(1);
    expect(porCedula.data[0].cedula).toBe('101240037');

    const porNombre = service.searchPadron('SOLANO VARGAS', 1, 10);
    expect(porNombre.total).toBe(1);
    expect(porNombre.data[0].cedula).toBe('201300001');
  });

  it('calcula estadísticas agregadas por provincia', async () => {
    await service.downloadAndLoadPadron(zipPath);
    const stats = service.getStats();
    expect(stats.total).toBe(4);
    expect(stats.porProvincia).toHaveLength(3);

    const sanJose = stats.porProvincia.find((p) => p.provincia === 'SAN JOSE');
    expect(sanJose?.electores).toBe(2);
    expect(sanJose?.cantones[0].canton).toBe('PURISCAL');
  });

  it('lanza error si se consulta sin datos cargados', () => {
    expect(() => service.getData()).toThrow();
  });
});
