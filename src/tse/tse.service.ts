import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import AdmZip from 'adm-zip';
import { readFile } from 'node:fs/promises';

const PADRON_URL = 'https://www.tse.go.cr/zip/padron/padron_completo.zip';
const PADRON_FUENTE = 'https://www.tse.go.cr/descarga_padron.html';

const CODIGO_PROVINCIA: Record<string, string> = {
  '1': 'SAN JOSE',
  '2': 'ALAJUELA',
  '3': 'CARTAGO',
  '4': 'HEREDIA',
  '5': 'GUANACASTE',
  '6': 'PUNTARENAS',
  '7': 'LIMON',
};

export interface PadronRecord {
  cedula: string;
  codigoElectoral: string;
  fechaCaducidad: string;
  junta: string;
  nombre: string;
  apellido1: string;
  apellido2: string;
  nombreCompleto: string;
  provincia: string;
  canton: string;
  distrito: string;
}

export interface DistritoElectoral {
  codigo: string;
  provincia: string;
  canton: string;
  distrito: string;
}

export interface LoadMetadata {
  fuente: string;
  fechaDescarga: string;
  registros: number;
  archivo: string;
}

@Injectable()
export class TseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TseService.name);
  private padron: PadronRecord[] = [];
  private distritoMap = new Map<string, DistritoElectoral>();
  private metadata: LoadMetadata | null = null;
  private loading = false;

  onApplicationBootstrap() {
    this.downloadAndLoadPadron().catch((error) => {
      this.logger.warn(
        `No se pudo precargar el padrón al iniciar: ${(error as Error).message}. ` +
          'Puede intentar de nuevo manualmente con la ruta POST /api/tse/download.',
      );
    });
  }

  async downloadAndLoadPadron(localPath?: string): Promise<LoadMetadata> {
    if (this.loading) {
      throw new HttpException(
        'Ya hay una carga del padrón en curso',
        HttpStatus.CONFLICT,
      );
    }
    this.loading = true;
    try {
      const buffer = await this.obtenerZip(localPath);
      const zip = new AdmZip(buffer);
      const archivos = zip.getEntries().map((e) => e.entryName);
      this.logger.log(`Contenido del ZIP: ${archivos.join(', ')}`);

      const padronEntry = zip
        .getEntries()
        .find((e) => e.entryName.toUpperCase().includes('PADRON'));
      const distelecEntry = zip
        .getEntries()
        .find((e) => e.entryName.toUpperCase().includes('DISTELEC'));
      const leameEntry = zip
        .getEntries()
        .find((e) => e.entryName.toUpperCase().includes('LEAME'));

      if (!padronEntry) {
        throw new HttpException(
          'No se encontró PADRON.TXT dentro del ZIP',
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (leameEntry) {
        this.logger.log('--- LEAME.TXT (primeras líneas) ---');
        this.logger.log(decodeTse(leameEntry.getData()).slice(0, 1200));
      }

      if (distelecEntry) {
        this.distritoMap = this.parseDistritos(
          decodeTse(distelecEntry.getData()),
        );
        this.logger.log(
          `${this.distritoMap.size} distritos electorales cargados.`,
        );
      } else {
        this.distritoMap = new Map();
        this.logger.warn('No se encontró DISTELEC.TXT en el ZIP');
      }

      this.padron = this.parsePadron(decodeTse(padronEntry.getData()));

      const fecha = new Date().toISOString();
      this.metadata = {
        fuente: PADRON_FUENTE,
        fechaDescarga: fecha,
        registros: this.padron.length,
        archivo: padronEntry.entryName,
      };

      this.logger.log(
        `${this.padron.length} electores cargados en memoria (${new Date(fecha).toLocaleString()}).`,
      );
      return this.metadata;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Falló la carga del padrón: ${(error as Error).message}`,
      );
      throw new HttpException(
        `No se pudo cargar el padrón: ${(error as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      this.loading = false;
    }
  }

  private async obtenerZip(localPath?: string): Promise<Buffer> {
    if (localPath) {
      this.logger.log(`Leyendo padrón desde archivo local: ${localPath}`);
      return readFile(localPath);
    }

    this.logger.log(`Descargando padrón desde ${PADRON_URL} ...`);
    const response = await fetch(PADRON_URL, {
      headers: { 'user-agent': 'Mozilla/5.0 (proyecto académico OSINT)' },
    });

    if (!response.ok) {
      throw new HttpException(
        `El servidor del TSE respondió ${response.status}. Es posible que el sitio bloquee descargas automáticas.`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    this.logger.log(
      `Descargados ${(buffer.length / 1024 / 1024).toFixed(2)} MB.`,
    );
    return buffer;
  }

  private parsePadron(text: string): PadronRecord[] {
    const lineas = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lineas.length === 0) {
      throw new HttpException(
        'El archivo PADRON esta vacío.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    let cuerpo = lineas;
    if (this.esCabecera(lineas[0])) {
      this.logger.log(
        'Detectada cabecera en PADRON; se omite la primera línea.',
      );
      cuerpo = lineas.slice(1);
    }

    const delimiter = this.detectarDelimitador(lineas[0]);
    this.logger.log(
      `Formato PADRON: delimiter="${delimiter}", ${cuerpo.length} líneas.`,
    );

    const registros: PadronRecord[] = [];
    for (const linea of cuerpo) {
      const campos = linea.split(delimiter).map((c) => c.trim());
      if (campos.length < 7) continue;

      const cedula = campos[0];
      if (!/^\d{3,12}$/.test(cedula)) continue;

      const codigoElectoral = /^\d+$/.test(campos[1]) ? campos[1] : '';
      const fechaCaducidad = /^\d{8}$/.test(campos[3]) ? campos[3] : '';
      const junta = /^\d+$/.test(campos[4]) ? campos[4] : '';

      const nombre = campos[campos.length - 3] ?? '';
      const apellido1 = campos[campos.length - 2] ?? '';
      const apellido2 = campos[campos.length - 1] ?? '';

      const distrito = this.distritoMap.get(codigoElectoral);

      registros.push({
        cedula,
        codigoElectoral,
        fechaCaducidad,
        junta,
        nombre,
        apellido1,
        apellido2,
        nombreCompleto: [apellido1, apellido2, nombre]
          .filter(Boolean)
          .join(' ')
          .trim(),
        provincia:
          distrito?.provincia ?? this.provinciaDesdeCodigo(codigoElectoral),
        canton: distrito?.canton ?? 'NO DEFINIDO',
        distrito:
          distrito?.distrito ?? ('SIN DISTRITO ' + codigoElectoral).trim(),
      });
    }

    this.logger.log(`Parseados ${registros.length} registros válidos.`);
    return registros;
  }

  private esCabecera(linea: string): boolean {
    const primerCampo = linea.split(deT).map((c) => c.trim())[0] ?? '';
    return !/^\d+$/.test(primerCampo.replace(/[|,;\t]/g, ''));
  }

  private provinciaDesdeCodigo(codigo: string): string {
    if (!codigo || !/^\d/.test(codigo)) return 'NO DEFINIDO';
    return CODIGO_PROVINCIA[codigo[0]] ?? 'NO DEFINIDO';
  }

  private detectarDelimitador(linea: string): string {
    const candidates = ['|', ',', ';', '\t'];
    const sorted = [...candidates].map((d) => ({
      d,
      c: linea.split(d).length - 1,
    }));
    sorted.sort((a, b) => b.c - a.c);
    return sorted[0].c > 0 ? sorted[0].d : '|';
  }

  private parseDistritos(text: string): Map<string, DistritoElectoral> {
    const lineas = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const delimiter = this.detectarDelimitador(lineas[0] ?? '');
    const map = new Map<string, DistritoElectoral>();

    if (lineas.length > 0 && this.esCabecera(lineas[0])) {
      lineas.shift();
    }

    for (const linea of lineas) {
      const campos = linea.split(delimiter).map((c) => c.trim());
      if (campos.length < 4) continue;
      if (!/^\d+$/.test(campos[0])) continue;

      map.set(campos[0], {
        codigo: campos[0],
        provincia: campos[1].toUpperCase(),
        canton: campos[2].toUpperCase(),
        distrito: campos[3].toUpperCase(),
      });
    }
    return map;
  }

  getData(page = 1, limit = 50) {
    this.exigirDatos();
    const start = (page - 1) * limit;
    return {
      data: this.padron.slice(start, start + limit),
      page,
      limit,
      total: this.padron.length,
      metadata: this.metadata,
    };
  }

  searchPadron(query: string, page = 1, limit = 50) {
    this.exigirDatos();
    const q = query.trim().toLowerCase();
    if (!q) {
      throw new HttpException(
        'El parámetro q es obligatorio',
        HttpStatus.BAD_REQUEST,
      );
    }

    let resultados: PadronRecord[];
    if (/^\d{3,12}$/.test(q)) {
      resultados = this.padron.filter((r) => r.cedula.includes(q));
    } else {
      const partes = q.split(/\s+/);
      resultados = this.padron.filter((r) =>
        partes.every((p) => r.nombreCompleto.toLowerCase().includes(p)),
      );
    }

    const start = (page - 1) * limit;
    return {
      query,
      total: resultados.length,
      page,
      limit,
      data: resultados.slice(start, start + limit),
      metadata: this.metadata,
    };
  }

  getStats() {
    this.exigirDatos();

    const porProvincia = new Map<string, number>();
    const porCanton = new Map<string, number>();
    for (const r of this.padron) {
      const p = r.provincia || 'NO DEFINIDO';
      porProvincia.set(p, (porProvincia.get(p) ?? 0) + 1);
      porCanton.set(
        `${p}|${r.canton}`,
        (porCanton.get(`${p}|${r.canton}`) ?? 0) + 1,
      );
    }

    return {
      total: this.padron.length,
      distritosElectorales: this.distritoMap.size,
      porProvincia: [...porProvincia.entries()]
        .map(([provincia, electores]) => ({
          provincia,
          electores,
          porcentaje: +(100 * (electores / this.padron.length)).toFixed(2),
          cantones: [...porCanton.entries()]
            .filter(([key]) => key.startsWith(`${provincia}|`))
            .map(([key, c]) => ({ canton: key.split('|')[1], electores: c }))
            .sort((a, b) => b.electores - a.electores),
        }))
        .sort((a, b) => b.electores - a.electores),
      metadata: this.metadata,
    };
  }

  getCantones(provincia: string) {
    this.exigirDatos();
    const p = (provincia || '')
      .trim()
      .toUpperCase()
      .replace(/[ÁÉÍÓÚ]/g, (c) =>
        c === 'Á'
          ? 'A'
          : c === 'É'
            ? 'E'
            : c === 'Í'
              ? 'I'
              : c === 'Ó'
                ? 'O'
                : 'U',
      );
    if (!p) {
      throw new HttpException(
        'El parámetro provincia es obligatorio (ej: San José, Alajuela, Cartago...)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const porCanton = new Map<string, number>();
    for (const r of this.padron) {
      if (r.provincia === p) {
        porCanton.set(r.canton, (porCanton.get(r.canton) ?? 0) + 1);
      }
    }

    return {
      provincia: p,
      electores: [...porCanton.values()].reduce((a, b) => a + b, 0),
      cantones: [...porCanton.entries()]
        .map(([canton, electores]) => ({ canton, electores }))
        .sort((a, b) => b.electores - a.electores),
      metadata: this.metadata,
    };
  }

  getDistritos() {
    this.exigirDatos();
    return {
      distritos: [...this.distritoMap.values()],
      metadata: this.metadata,
    };
  }

  getStatus() {
    return {
      cargado: this.padron.length > 0,
      registros: this.padron.length,
      distritosElectorales: this.distritoMap.size,
      cargando: this.loading,
      metadata: this.metadata,
    };
  }

  private exigirDatos() {
    if (this.padron.length === 0) {
      throw new HttpException(
        'El padrón no está cargado. Ejecute primero POST /api/tse/download.',
        HttpStatus.PRECONDITION_FAILED,
      );
    }
  }
}

const deT = /[|,;\t]/;

function decodeTse(buffer: Buffer): string {
  let utf8 = '';
  try {
    utf8 = buffer.toString('utf-8');
    if (!utf8.includes('\uFFFD')) return utf8;
  } catch {
    /* continuar */
  }
  return buffer.toString('latin1');
}
