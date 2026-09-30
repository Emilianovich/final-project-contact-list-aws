import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';

const base = process.env.API_TEST_URL || 'http://localhost:3000';
const origin = process.env.TEST_FRONTEND_ORIGIN || 'http://localhost:8080';
const password = 'Test-only-password-2026!';
async function request(path, { token, body, method = 'GET', headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  } catch (cause) { throw new Error(`Integration API unavailable at ${base}; start real API + Postgres before running tests.`, { cause }); }
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
function error(result, status, code) { assert.equal(result.status, status, JSON.stringify(result.data).slice(0, 500)); assert.equal(result.data.code, code); assert.equal(typeof result.data.message, 'string'); }
async function account() {
  const email = `integration-${randomUUID()}@example.com`;
  const result = await request('/auth/register', { method: 'POST', body: { email, password } });
  assert.equal(result.status, 201, JSON.stringify(result.data).slice(0, 500));
  assert.equal(result.data.user.email, email);
  assert.ok(result.data.accessToken); assert.ok(result.data.refreshToken); assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(result.data.user.password_hash, undefined);
  assert.equal(result.data.user.passwordHash, undefined);
  return { email, token: result.data.accessToken, refreshToken: result.data.refreshToken, id: result.data.user.id };
}
const input = (extra = {}) => ({ name: 'Ana Panamá', email: 'ana@example.com', country: 'PA', phone: '6123-4567', ...extra });
async function create(user, extra = {}) { const r = await request('/contacts', { method: 'POST', token: user.token, body: input(extra) }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; }
async function list(user, query = '') { const r = await request(`/contacts${query}`, { token: user.token }); assert.equal(r.status, 200); assert.ok(Array.isArray(r.data.items)); return r.data.items; }

test('registration, normalized email uniqueness, login and bearer identity', async () => {
  const user = await account();
  error(await request('/auth/register', { method: 'POST', body: { email: ` ${user.email.toUpperCase()} `, password } }), 409, 'EMAIL_EXISTS');
  error(await request('/auth/register', { method: 'POST', body: { email: 'bad', password: 'short' } }), 400, 'VALIDATION_ERROR');
  const login = await request('/auth/login', { method: 'POST', body: { email: user.email.toUpperCase(), password } });
  assert.equal(login.status, 200); assert.ok(login.data.accessToken);
  const me = await request('/auth/me', { token: login.data.accessToken }); assert.equal(me.status, 200); assert.equal(me.data.id, user.id);
  for (const email of [user.email, `${randomUUID()}@example.com`]) error(await request('/auth/login', { method: 'POST', body: { email, password: 'Incorrect-password!' } }), 401, 'UNAUTHORIZED');
});

test('authentication rejects absent, tampered, expired and query-string tokens', async () => {
  const user = await account();
  const parts = user.token.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert.equal(claims.exp - claims.iat, 900);
  const tamperedPayload = Buffer.from(JSON.stringify({ ...claims, sub: randomUUID() })).toString('base64url');
  for (const token of [undefined, 'nonsense', `${parts[0]}.${tamperedPayload}.${parts[2]}`]) error(await request('/contacts', { token }), 401, 'UNAUTHORIZED');
  error(await request(`/contacts?access_token=${user.token}`), 401, 'UNAUTHORIZED');
  assert.ok(process.env.TEST_JWT_ACCESS_SECRET, 'TEST_JWT_ACCESS_SECRET is required to prove rejection of correctly signed expired JWTs');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const control = await request('/contacts', { token: `${header}.${parts[1]}.${createHmac('sha256', process.env.TEST_JWT_ACCESS_SECRET).update(`${header}.${parts[1]}`).digest('base64url')}` }); assert.equal(control.status, 200, 'Signing secret must match test API before testing expired signature');
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: 1, exp: 2 })).toString('base64url');
  const signature = createHmac('sha256', process.env.TEST_JWT_ACCESS_SECRET).update(`${header}.${payload}`).digest('base64url');
  error(await request('/contacts', { token: `${header}.${payload}.${signature}` }), 401, 'UNAUTHORIZED');
});

test('CRUD preserves identity, normalizes phone and soft-deletes/restores idempotently', async () => {
  const user = await account(); const contact = await create(user);
  assert.equal(contact.userId, user.id); assert.equal(contact.phoneE164, '+50761234567'); assert.equal(contact.deletedAt, null); assert.ok(Number.isFinite(Date.parse(contact.createdAt)));
  let r = await request(`/contacts/${contact.id}`, { method: 'PATCH', token: user.token, body: input({ name: 'Ana Editada', phone: '+50761234567' }) });
  assert.equal(r.status, 200); assert.equal(r.data.name, 'Ana Editada'); assert.equal(r.data.id, contact.id); assert.equal(r.data.createdAt, contact.createdAt);
  for (let i = 0; i < 2; i++) { r = await request(`/contacts/${contact.id}`, { method: 'DELETE', token: user.token }); assert.equal(r.status, 200); assert.ok(Number.isFinite(Date.parse(r.data.deletedAt))); }
  assert.equal((await list(user)).length, 0); assert.equal((await list(user, '?status=deleted'))[0].id, contact.id);
  error(await request(`/contacts/${contact.id}`, { method: 'PATCH', token: user.token, body: input() }), 409, 'CONTACT_DELETED');
  for (let i = 0; i < 2; i++) { r = await request(`/contacts/${contact.id}/restore`, { method: 'POST', token: user.token }); assert.equal(r.status, 200); assert.equal(r.data.deletedAt, null); assert.equal(r.data.name, 'Ana Editada'); assert.equal(r.data.createdAt, contact.createdAt); }
  assert.equal((await list(user)).length, 1); assert.equal((await list(user, '?status=deleted')).length, 0);
});

test('ownership cannot be bypassed through item endpoints or input', async () => {
  const a = await account(), b = await account(); const contact = await create(a); await create(b);
  const owned = await list(b); assert.equal(owned.length, 1); assert.equal(owned[0].userId, b.id); assert.notEqual(owned[0].id, contact.id);
  for (const id of [contact.id, randomUUID()]) {
    for (const method of ['GET', 'PATCH', 'DELETE']) error(await request(`/contacts/${id}`, { method, token: b.token, ...(method === 'PATCH' ? { body: input() } : {}) }), 404, 'NOT_FOUND');
    error(await request(`/contacts/${id}/restore`, { method: 'POST', token: b.token }), 404, 'NOT_FOUND');
  }
  for (const extra of [{ userId: a.id }, { id: randomUUID() }, { deletedAt: new Date().toISOString() }]) {
    error(await request('/contacts', { method: 'POST', token: b.token, body: input({ phone: '6123-4568', ...extra }) }), 400, 'VALIDATION_ERROR');
    error(await request(`/contacts/${contact.id}`, { method: 'PATCH', token: a.token, body: input(extra) }), 400, 'VALIDATION_ERROR');
  }
  const unchanged = await request(`/contacts/${contact.id}`, { token: a.token }); assert.equal(unchanged.data.name, contact.name); assert.equal(unchanged.data.deletedAt, null);
});

test('phone uniqueness covers normalized creation, editing, trash and concurrent writes', async () => {
  const user = await account(); const first = await create(user), second = await create(user, { phone: '6123-4568' });
  error(await request('/contacts', { method: 'POST', token: user.token, body: input({ phone: '+50761234567' }) }), 409, 'PHONE_EXISTS');
  error(await request(`/contacts/${second.id}`, { method: 'PATCH', token: user.token, body: input() }), 409, 'PHONE_EXISTS');
  await request(`/contacts/${first.id}`, { method: 'DELETE', token: user.token });
  for (const path of ['/contacts', `/contacts/${second.id}`]) {
    const result = await request(path, { method: path === '/contacts' ? 'POST' : 'PATCH', token: user.token, body: input() }); error(result, 409, 'PHONE_DELETED'); assert.equal(result.data.contactId, first.id);
  }
  const unchanged = await request(`/contacts/${second.id}`, { token: user.token }); assert.equal(unchanged.data.phoneE164, second.phoneE164);
  const writes = await Promise.all(Array.from({ length: 5 }, () => request('/contacts', { method: 'POST', token: user.token, body: input({ phone: '6123-4569' }) })));
  assert.equal(writes.filter(r => r.status === 201).length, 1);
  for (const r of writes.filter(r => r.status !== 201)) error(r, 409, 'PHONE_EXISTS');
  assert.equal((await list(user)).length, 2);
});

test('validation rejects invalid country, country-phone mismatch, malformed IDs and filters', async () => {
  const user = await account();
  for (const extra of [{ name: '' }, { email: 'bad' }, { country: 'ZZ' }, { phone: '123' }, { country: 'US', phone: '+50761234567' }]) error(await request('/contacts', { method: 'POST', token: user.token, body: input(extra) }), 400, 'VALIDATION_ERROR');
  for (const path of ['/contacts/not-a-uuid', '/contacts?country=ZZ', '/contacts?status=everything']) error(await request(path, { token: user.token }), 400, 'VALIDATION_ERROR');
  assert.equal((await list(user)).length, 0);
});

test('partial case-insensitive name/email search combines with country and trash filters', async () => {
  const user = await account(); const a = await create(user), b = await create(user, { name: 'Beatriz', email: 'other@example.net', phone: '6123-4568' });
  await create(user, { name: 'Ana Estados Unidos', email: 'us@example.net', country: 'US', phone: '2025550123' });
  assert.equal((await list(user, '?q=ANA')).length, 2);
  assert.deepEqual((await list(user, '?q=ANA&country=PA')).map(c => c.id), [a.id]);
  assert.deepEqual((await list(user, '?q=OTHER%40EXAMPLE')).map(c => c.id), [b.id]);
  await request(`/contacts/${a.id}`, { method: 'DELETE', token: user.token });
  assert.equal((await list(user, '?q=ANA&country=PA')).length, 0);
  assert.deepEqual((await list(user, '?status=deleted&q=ANA&country=PA')).map(c => c.id), [a.id]);
});

test('CORS advertises only the configured browser origin and permits bearer headers', async () => {
  const allowed = await request('/contacts', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.ok([200, 204].includes(allowed.status)); assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  const headers = allowed.headers.get('access-control-allow-headers')?.toLowerCase() || ''; assert.match(headers, /authorization/); assert.match(headers, /content-type/);
  for (const hostile of ['http://attacker.invalid', `${origin}.attacker.invalid`]) {
    const blocked = await request('/contacts', { method: 'OPTIONS', headers: { Origin: hostile, 'Access-Control-Request-Method': 'POST' } }); assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  }
});


test('refresh rotates JWTs, rejects token confusion and revokes session family on replay', async () => {
  const user = await account();
  const claims = JSON.parse(Buffer.from(user.refreshToken.split('.')[1], 'base64url').toString());
  assert.equal(claims.exp - claims.iat, 604800);
  error(await request('/contacts', { token: user.refreshToken }), 401, 'UNAUTHORIZED');
  error(await request('/auth/refresh', { method: 'POST', body: { refreshToken: user.token } }), 401, 'UNAUTHORIZED');
  const refresh = await request('/auth/refresh', { method: 'POST', body: { refreshToken: user.refreshToken } });
  assert.equal(refresh.status, 200); assert.ok(refresh.data.accessToken); assert.ok(refresh.data.refreshToken); assert.notEqual(refresh.data.refreshToken, user.refreshToken); assert.equal(refresh.headers.get('set-cookie'), null);
  const rotatedClaims = JSON.parse(Buffer.from(refresh.data.refreshToken.split('.')[1], 'base64url').toString()); assert.equal(rotatedClaims.exp, claims.exp);
  assert.equal((await request('/auth/me', { token: refresh.data.accessToken })).status, 200);
  error(await request('/auth/refresh', { method: 'POST', body: { refreshToken: user.refreshToken } }), 401, 'UNAUTHORIZED');
  error(await request('/auth/me', { token: refresh.data.accessToken }), 401, 'UNAUTHORIZED');
  error(await request('/auth/refresh', { method: 'POST', body: { refreshToken: refresh.data.refreshToken } }), 401, 'UNAUTHORIZED');
});

test('logout invalidates access and refresh in its session but preserves another login', async () => {
  const user = await account();
  const other = await request('/auth/login', { method: 'POST', body: { email: user.email, password } }); assert.equal(other.status, 200);
  const result = await request('/auth/logout', { method: 'POST', body: { refreshToken: user.refreshToken } }); assert.equal(result.status, 204); assert.equal(result.headers.get('set-cookie'), null);
  error(await request('/auth/me', { token: user.token }), 401, 'UNAUTHORIZED');
  error(await request('/auth/refresh', { method: 'POST', body: { refreshToken: user.refreshToken } }), 401, 'UNAUTHORIZED');
  assert.equal((await request('/auth/me', { token: other.data.accessToken })).status, 200);
  error(await request('/auth/refresh', { method: 'POST', body: { refreshToken: 'invalid' } }), 401, 'UNAUTHORIZED');
});

test('correctly signed expired refresh is rejected without revoking unrelated valid sessions', async () => {
  const user = await account();
  const secret = process.env.TEST_JWT_REFRESH_SECRET; assert.ok(secret, 'TEST_JWT_REFRESH_SECRET must match isolated API');
  const [header, payload] = user.refreshToken.split('.');
  const sign = value => `${header}.${value}.${createHmac('sha256', secret).update(`${header}.${value}`).digest('base64url')}`;
  const control = await request('/auth/refresh', { method: 'POST', body: { refreshToken: sign(payload) } }); assert.equal(control.status, 200, 'Refresh signing secret must match before testing expiry');
  const rotated = control.data.refreshToken.split('.'); const claims = JSON.parse(Buffer.from(rotated[1], 'base64url').toString());
  const expired = Buffer.from(JSON.stringify({ ...claims, iat: 1, exp: 2 })).toString('base64url');
  error(await request('/auth/refresh', { method: 'POST', body: { refreshToken: sign(expired) } }), 401, 'UNAUTHORIZED');
  assert.equal((await request('/auth/me', { token: control.data.accessToken })).status, 200);
});
