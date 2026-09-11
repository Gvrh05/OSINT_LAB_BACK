# OSINT CR - Backend

API NestJS que descarga, normaliza y consulta fuentes públicas de Costa Rica.

## Requisitos

- Node.js 20 o superior
- pnpm

## Ejecución

```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

La API queda disponible en `http://localhost:3000/api`.

## Endpoints principales

- `GET /api/oij`: estado y procedencia de la fuente.
- `GET /api/oij/search`: búsqueda OIJ paginada.
- `GET /api/oij/summary`: resumen del conjunto de datos.
- `GET /api/oij/filters`: filtros obtenidos del CSV real.
- `GET /api/oij/trends`: registros agrupados por mes.
- `GET /api/oij/statistics`: estadísticas filtradas por año, mes, provincia o delito.
- `GET /api/oij/crimes`: delitos agrupados.
- `GET /api/oij/locations`: registros agrupados por provincia.
- `GET /api/search`: búsqueda común de la plataforma.

## Variables de entorno

- `PORT`: puerto del backend.
- `FRONTEND_URL`: orígenes permitidos por CORS, separados por comas.

## Fuente actual

Estadísticas Policiales de 2023, 2024, 2025 y 2026 del Organismo de
Investigación Judicial, publicadas en el portal de datos abiertos del Poder
Judicial de Costa Rica. La API mantiene una caché independiente por año.
