# Cerca · Libreta de contactos

Monorepo de la aplicación de contactos. React, NestJS y PostgreSQL trabajan
juntos, y cada usuario solo puede acceder a sus propios contactos.

## Prueba local con Docker

Requiere Docker Desktop. Copia `.env.example` a `.env` y sustituye las
contraseñas y secretos. Los secretos JWT deben ser distintos y tener al menos
32 caracteres.

```sh
cp .env.example .env
docker compose up --build --detach
docker compose ps
```

Abre `http://localhost:8080`. En este equipo la API usa
`http://localhost:3001` porque el puerto 3000 está ocupado; puedes elegir otro
valor mediante `API_PORT` y `API_BASE_URL`.

Compose representa exclusivamente el entorno local:

- `web`: imagen independiente de React/Nginx, puerto 8080.
- `api`: imagen independiente de NestJS, puerto configurable.
- `db`: PostgreSQL 16 con volumen persistente y sin puerto público.
- `migrate`: tarea puntual que aplica el esquema antes de iniciar la API.

`docker compose down` detiene el entorno y conserva los datos. El comando
`docker compose down --volumes` también elimina la base local.

## Autenticación

La API usa `@nestjs/jwt` directamente, sin Passport ni cookies. Registro y
login devuelven un access token de 15 minutos y un refresh token de 7 días.
El frontend los guarda en `sessionStorage`, rota el refresh token y los envía
como Bearer/JSON. El backend valida la sesión en PostgreSQL y aplica el usuario
autenticado a cada operación.

Este esquema funciona por HTTP para pruebas, pero HTTP no cifra contraseñas ni
tokens durante el tránsito. Usa datos ficticios hasta colocar HTTPS delante de
los servicios.

## ECS/Fargate y RDS

Web y API tienen Dockerfiles independientes y se desplegarán como servicios
ECS separados. `API_BASE_URL` se inyecta al contenedor web al arrancar, por lo
que cambiar el endpoint no obliga a reconstruir su imagen.

La API recibe configuración por variables de entorno validadas al iniciar.
Para RDS cambia `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, usa
`DB_SSL=true` y monta el certificado en `DB_SSL_CA_PATH`. Guarda contraseñas y
secretos JWT en AWS Secrets Manager y referéncialos desde la tarea ECS.

SQL para RDS:

1. `database/00-create-database.sql`: plantilla administrativa opcional.
2. `database/01-schema.sql`: tablas, restricciones e índices.
3. `database/02-countries.sql`: catálogo completo de países y prefijos.

En RDS normalmente crearás la base desde AWS y ejecutarás los archivos 01 y 02
conectado a ella. La tarea local `migrate` realiza ambas operaciones de forma
idempotente.

## Desarrollo y pruebas

Requiere Node 24 y pnpm 11.1.2.

```sh
pnpm install
pnpm build
pnpm test
```

Las pruebas API usan HTTP y PostgreSQL reales. Cubren registro/login,
expiración y rotación JWT, logout, CORS, aislamiento entre usuarios, CRUD,
papelera, filtros, validación telefónica, conflictos concurrentes y
restricciones directas de PostgreSQL. El contrato está en
`docs/api-contract.md`.

## Estructura

- `apps/web`: React, Vite, TanStack Router/Query/Form, Zustand y ocho temas.
- `apps/api`: NestJS modular, JWT, Drizzle y PostgreSQL.
- `packages/contracts`: esquemas Zod y tipos compartidos.
- `database`: SQL portable para Postgres/RDS.
- `compose.yaml`: orquestación exclusiva de pruebas locales.
