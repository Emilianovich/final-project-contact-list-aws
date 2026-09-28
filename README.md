# Cerca · Libreta de contactos

Fase 1: aplicación local en React + TypeScript, Vite, TanStack Router, Query
y Form, Zustand, Zod, Temporal e IndexedDB. Fuente Arima alojada localmente.

## Desarrollo

Requiere Node 24 y pnpm 11.1.2.

```sh
pnpm install
pnpm dev
pnpm build
pnpm test
```

## Monorepo

- apps/web: SPA y Dockerfile del frontend.
- apps/api: espacio reservado para NestJS en fase 2.
- packages/contracts: contratos Zod y tipos compartidos.
- docs/schema.sql: propuesta Postgres, sin ejecutar en esta fase.
- compose.yaml: contenedor web; api y Postgres se añadirán en fase 2.

Cada aplicación tendrá su propio contenedor. Los builds usan la raíz del
monorepo como contexto para consumir los contratos compartidos.

```sh
docker compose up --build -d
```

Abre http://localhost:8080. Nginx soporta acceso directo a /papelera.

## Reglas y alcance

Nombre, correo, país ISO y teléfono E.164. Teléfono único por usuario
incluyendo papelera. Borrado lógico y restauración sin caducidad.
Búsqueda parcial por nombre o correo, insensible a mayúsculas y acentos,
combinable con filtro de país en ambas vistas. Ocho temas persistentes.

La libreta comienza vacía. Datos en IndexedDB; apariencia en localStorage.
No hay backend, cuentas reales, sincronización ni eliminación definitiva.
Los datos dependen del navegador y origen; borrar sus datos borra la libreta.
Cambiar del servidor Vite al contenedor supone otro origen y otra libreta.

El repositorio expone list/save/remove/restore para sustituirlo por HTTP en
fase 2. IndexedDB usa transacciones y un índice único compuesto para evitar
duplicados concurrentes. Las fechas se guardan como instantes ISO UTC.

## Validación

Pruebas de normalización, país, duplicados activos/eliminados, restauración,
filtros combinados y concurrencia. TypeScript se comprueba en cada build.

## Estado de verificación

- Compilación de producción y comprobación TypeScript: correctas.
- Pruebas automatizadas de reglas de negocio: correctas.
- Servidor local: respuesta HTTP 200.
- Revisión visual interactiva: pendiente; la herramienta de control del
  navegador no recibió permiso para usar Helium.
- Imagen Docker: pendiente de ejecutar; el servicio Docker de este equipo
  devuelve acceso denegado. El CLI tampoco tiene disponible Compose.
