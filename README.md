# OSINT Costa Rica — Backend

Backend del sistema web integrador de fuentes OSINT de Costa Rica. Consume, procesa y expone datos públicos a través de una API REST, evitando problemas de CORS y normalizando la información para el frontend.

## Problema que resuelve

Los datos públicos de Costa Rica (TSE, OIJ, etc.) se publican en formatos que no son directamente consumibles por un navegador (ZIP/TXT grandes, CSVs, APIs externas). Este backend los descarga, interpreta según su formato oficial, los normaliza y los expone mediante una API REST capaz de buscar y agregar estadísticas sin exponer en el frontend los problemas de formato, tamaño o disponibilidad de cada fuente.

## Fuentes OSINT integradas

| Fuente | Información | Consumo | Responsable |
| ------ | ----------- | ------- | ----------- |
| TSE — Padrón Nacional Electoral | Electores inscritos por distrito electoral | ZIP → TXT (batch) | *(integrante TSE)* |
| OIJ — Estadísticas Policiales | Denuncias 2023–2026 | CSV (catálogo) | *(integrante OIJ)* |

### TSE — Padrón Nacional Electoral

- URL oficial: https://www.tse.go.cr/descarga_padron.html
- Archivo: `padron_completo.zip` → `PADRON_COMPLETO.txt`, `distelec.txt`, `Leame.txt`
- Mecanismo: descarga automatizada del ZIP, extracción y parseo de los TXT según el formato descrito en `Leame.txt`.

`PADRON_COMPLETO.txt` (delimitado por coma, sin cabecera):

```
cedula, codigoElectoral, relleno, fechaCaducidad, junta, nombre, apellido1, apellido2
```

`distelec.txt` (delimitado por coma):

```
codigoDistrito, provincia, canton, nombreDistrito
```

El código electoral se cruza con `distelec.txt` para resolver provincia, cantón y distrito donde está inscrito cada elector (incluye el voto en el extranjero, identificado como `CONSULADO`).

### OIJ — Estadísticas Policiales

- URL oficial: portal de datos abiertos del Poder Judicial de Costa Rica.
- Estadísticas de 2023, 2024, 2025 y 2026. La API mantiene una caché independiente por año.

## Arquitectura

```
Fuente OSINT (ZIP/TXT/CSV)  →  NestJS backend (ETL + memoria)  →  API REST  →  Frontend
```

- **NestJS 11** + TypeScript.
- **adm-zip** para extraer el contenido del ZIP del TSE.
- Los datos se cargan **en memoria** al iniciar la aplicación (o manualmente) y se exponen como JSON.

## Requisitos

- Node.js 20+ (usa `fetch`, disponible global a partir de Node 18)
- pnpm

## Instalación

```bash
pnpm install
```

## Ejecución

```bash
pnpm start:dev        # desarrollo con recarga automática
pnpm build && pnpm start:prod
```

El servidor escucha en `http://localhost:3000` con prefijo global `/api`.

Al iniciar, el módulo TSE intenta descargar automáticamente el padrón del TSE (~73–78 MB). Mientras carga, sus rutas de datos responden `412 Precondition Failed`. Puede reiniciarse la carga manualmente con `POST /api/tse/download`.

> Nota: si el sitio del TSE bloquea la descarga automática, descargue el ZIP manualmente y cargue desde archivo local:
> `POST /api/tse/download` con body `{ "filePath": "C:\\ruta\\padron_completo.zip" }`

### Variables de entorno

| Variable | Descripción | Valor por defecto |
| -------- | ----------- | ----------------- |
| `PORT`   | Puerto del servidor HTTP | `3000` |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por comas | `http://localhost:5173` |

Copie `.env.example` a `.env`. No se utilizan credenciales ni secretos.

## Rutas de la API

### Generales

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET`  | `/api` | Información del proyecto y rutas disponibles |

### TSE

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `POST` | `/api/tse/download` | Descarga y carga el padrón en memoria. Body opcional: `{ "filePath": "..." }` |
| `GET`  | `/api/tse/status` | Estado de la carga (registros, distritos, fecha de obtención) |
| `GET`  | `/api/tse/data?page=1&limit=50` | Registros paginados |
| `GET`  | `/api/tse/search?q=palabra o cedula` | Búsqueda por nombre/apellidos o cédula |
| `GET`  | `/api/tse/stats` | Estadísticas agregadas por provincia y cantón |
| `GET`  | `/api/tse/stats/cantones?provincia=SAN JOSE` | Cantones de una provincia |
| `GET`  | `/api/tse/distritos-electorales` | Catálogo de distritos electorales |

### OIJ

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET`  | `/api/oij` | Estado y procedencia de la fuente |
| `GET`  | `/api/oij/search` | Búsqueda paginada |
| `GET`  | `/api/oij/summary` | Resumen del conjunto de datos |
| `GET`  | `/api/oij/filters` | Filtros obtenidos del CSV real |
| `GET`  | `/api/oij/trends` | Registros agrupados por mes |
| `GET`  | `/api/oij/statistics` | Estadísticas filtradas por año, mes, provincia o delito |
| `GET`  | `/api/oij/crimes` | Delitos agrupados |
| `GET`  | `/api/oij/locations` | Registros agrupados por provincia |
| `GET`  | `/api/search` | Búsqueda común de la plataforma |

### Ejemplos

```bash
# Cargar padrón desde el servidor del TSE
curl -X POST http://localhost:3000/api/tse/download

# Cargar padrón desde un archivo local
curl -X POST http://localhost:3000/api/tse/download -H "Content-Type: application/json" \
  -d '{"filePath":"C:/temp/padron_completo.zip"}'

# Consultar estado TSE
curl http://localhost:3000/api/tse/status

# Estadísticas por provincia
curl http://localhost:3000/api/tse/stats

# Búsqueda por cédula o por nombre
curl "http://localhost:3000/api/tse/search?q=ALVAREZ"
curl "http://localhost:3000/api/tse/search?q=102340567"
```

## Pruebas

```bash
pnpm test        # pruebas unitarias (incluye ETL de un padrón sintético)
pnpm test:e2e    # pruebas end-to-end
pnpm lint        # eslint + prettier
```

## Uso responsable de OSINT

- El padrón del TSE contiene datos personales de las personas inscritas. La ley de protección de datos (Ley 8968) y el propio TSE restringen su uso.
- Para este proyecto académico la aplicación trabaja con **agregados y estadísticas** (electores por provincia, cantón y distrito), y no construye buscadores masivos de perfiles individuales.
- Se respeta el acceso público de las fuentes sin evadir autenticación, CAPTCHA ni límites.