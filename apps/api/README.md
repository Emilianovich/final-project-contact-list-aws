# API — reservada para la fase 2

Esta carpeta alojará la aplicación NestJS y su Dockerfile independiente.
No contiene un servidor ni simula autenticación en la fase 1.

Plan: Nest JWT sin Passport, Zod, Drizzle, Postgres y CORS restringido al
frontend. El futuro servicio api usará el contexto raíz del monorepo para
consumir @contactos/contracts. Postgres será otro servicio independiente.
El contenedor web solo servirá los archivos estáticos de Vite.
