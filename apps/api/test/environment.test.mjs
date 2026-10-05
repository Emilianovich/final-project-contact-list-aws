// Independent regression tests: config existed before this slice (not claimed as TDD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../dist/config/environment.js';
const valid = () => ({ FRONTEND_ORIGIN: 'http://localhost:8080', DB_HOST: 'db', DB_NAME: 'contactos', DB_USER: 'contactos_app', DB_PASSWORD: 'private-db-password', JWT_ACCESS_SECRET: 'a'.repeat(48), JWT_REFRESH_SECRET: 'b'.repeat(48) });
test('accepts independently configurable RDS credentials and strict TLS boolean', () => {
  const config = validateEnvironment({ ...valid(), DB_HOST: 'example.rds.amazonaws.com', DB_SSL: 'true', DB_SSL_CA_PATH: '/certs/rds.pem', PORT: '3100' });
  assert.equal(config.DB_HOST, 'example.rds.amazonaws.com'); assert.equal(config.DB_SSL, true); assert.equal(config.DB_SSL_CA_PATH, '/certs/rds.pem'); assert.equal(config.PORT, 3100);
  assert.equal(validateEnvironment({ ...valid(), DB_SSL: 'false' }).DB_SSL, false);
});
test('defaults CORS wildcard mode off and accepts only explicit boolean values', () => {
  assert.equal(validateEnvironment(valid()).CORS_ALLOW_ANY_ORIGIN, false);
  assert.equal(validateEnvironment({ ...valid(), CORS_ALLOW_ANY_ORIGIN: 'true' }).CORS_ALLOW_ANY_ORIGIN, true);
  assert.equal(validateEnvironment({ ...valid(), CORS_ALLOW_ANY_ORIGIN: true }).CORS_ALLOW_ANY_ORIGIN, true);
  assert.throws(() => validateEnvironment({ ...valid(), CORS_ALLOW_ANY_ORIGIN: 'yes' }));
});
test('fails startup for missing credentials, weak or shared JWT secrets and invalid ports', () => {
  for (const key of ['FRONTEND_ORIGIN', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) { const env = valid(); delete env[key]; assert.throws(() => validateEnvironment(env), new RegExp(key)); }
  for (const patch of [{ JWT_ACCESS_SECRET: 'weak' }, { JWT_REFRESH_SECRET: 'a'.repeat(48) }, { PORT: '65536' }, { DB_PORT: '0' }, { PORT: 'abc' }, { DB_SSL: 'yes' }]) assert.throws(() => validateEnvironment({ ...valid(), ...patch }));
});
test('CORS accepts an exact HTTP origin and rejects wildcards, path, userinfo and non-HTTP URLs', () => {
  for (const origin of ['*', 'http://localhost:8080/path', 'http://localhost:8080/', 'http://user:pass@localhost:8080', 'ftp://localhost', 'http://localhost:8080?x=1', 'http://localhost:8080#hash']) assert.throws(() => validateEnvironment({ ...valid(), FRONTEND_ORIGIN: origin }));
  assert.equal(validateEnvironment({ ...valid(), FRONTEND_ORIGIN: 'https://example.com' }).FRONTEND_ORIGIN, 'https://example.com');
});
test('startup validation errors never disclose credential values', () => {
  const values = { ...valid(), JWT_ACCESS_SECRET: 'private-short-secret', JWT_REFRESH_SECRET: 'private-short-secret', DB_PORT: 'not-a-port' };
  assert.throws(() => validateEnvironment(values), error => { for (const secret of [values.DB_PASSWORD, values.JWT_ACCESS_SECRET]) assert.ok(!error.message.includes(secret)); return true; });
});
