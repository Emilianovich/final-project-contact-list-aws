#!/usr/bin/env bash
set -euo pipefail
pnpm build
pnpm test
node --test apps/api/test/environment.test.mjs
export DB_HOST=127.0.0.1 DB_PORT="${CI_DB_PORT:-5432}" DB_NAME=contactos DB_USER=postgres DB_PASSWORD=ci-only-password DB_SSL=false
export FRONTEND_ORIGIN=http://localhost:8080 PORT="${CI_API_PORT:-3000}"
export API_TEST_URL="http://127.0.0.1:$PORT"
export JWT_ACCESS_SECRET=ci-access-secret-with-at-least-32-characters
export JWT_REFRESH_SECRET=ci-refresh-secret-with-at-least-32-characters
export TEST_JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" TEST_JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
export DATABASE_TEST_URL="postgresql://postgres:ci-only-password@127.0.0.1:$DB_PORT/contactos"
node apps/api/dist/database/migrate.js
node apps/api/dist/main.js &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if curl -fsS "$API_TEST_URL/health" >/dev/null; then break; fi
  sleep 1
done
node --test apps/api/test/api.integration.test.mjs apps/api/test/database.test.mjs
