import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { countryCodes } from '@contactos/contracts';

// Explicit opt-in prevents accidentally exercising a production database.
const connectionString = process.env.DATABASE_TEST_URL;
const base = process.env.API_TEST_URL || 'http://localhost:3000';
async function database() {
  assert.ok(connectionString, 'DATABASE_TEST_URL must identify an isolated disposable PostgreSQL database');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
}
async function call(path, body, token) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const password = 'Database-integration-secret-2026!';
async function register() {
  const email = `database-${randomUUID()}@example.com`;
  const result = await call('/auth/register', { email, password });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return { ...result.data, email };
}
async function rejectedStatement(client, sql, values, code) {
  await client.query('SAVEPOINT expected_constraint');
  await assert.rejects(client.query(sql, values), error => {
    assert.equal(error.code, code, error.message);
    return true;
  });
  await client.query('ROLLBACK TO SAVEPOINT expected_constraint');
}

test('country catalog includes every supported numbering region, including shared prefixes', async () => {
  const client = await database();
  try {
    const { rows } = await client.query('SELECT code, name, calling_code FROM countries');
    assert.deepEqual(rows.map(row => row.code).sort(), [...countryCodes].sort());
    for (const row of rows) { assert.ok(row.name.trim()); assert.match(row.calling_code, /^\+?[1-9][0-9]{0,3}$/); }
    assert.equal(rows.find(row => row.code === 'US').calling_code, rows.find(row => row.code === 'CA').calling_code);
  } finally { await client.end(); }
});

test('PostgreSQL enforces contact owner/phone uniqueness including trash, plus foreign keys', async () => {
  const client = await database();
  try {
    await client.query('BEGIN');
    const a = randomUUID(), b = randomUUID();
    for (const id of [a, b]) await client.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [id, `${id}@example.com`, 'constraint-only-not-a-real-password']);
    const insert = 'INSERT INTO contacts(id,user_id,name,email,country_code,phone_e164) VALUES($1,$2,$3,$4,$5,$6)';
    const values = (owner, phone = '+50761234567', country = 'PA') => [randomUUID(), owner, 'Constraint Contact', 'same@example.com', country, phone];
    const first = values(a);
    await client.query(insert, first);
    await rejectedStatement(client, insert, values(a), '23505');
    await client.query('UPDATE contacts SET deleted_at = now() WHERE id = $1', [first[0]]);
    await rejectedStatement(client, insert, values(a), '23505');
    // The unique key is per owner, not global. Email and name can repeat.
    await client.query(insert, values(b));
    await client.query(insert, values(a, '+50761234568'));
    await rejectedStatement(client, insert, values(randomUUID(), '+50761234569'), '23503');
    await rejectedStatement(client, insert, values(a, '+50761234569', 'ZZ'), '23503');
    await rejectedStatement(client, insert, values(a, 'not-a-phone'), '23514');
    const { rows } = await client.query('SELECT count(*)::int AS count FROM contacts WHERE user_id = ANY($1::uuid[])', [[a, b]]);
    assert.equal(rows[0].count, 3);
  } finally { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
});

test('PostgreSQL independently enforces normalized unique user email', async () => {
  const client = await database();
  try {
    await client.query('BEGIN');
    const email = `${randomUUID()}@example.com`;
    const sql = 'INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)';
    await client.query(sql, [randomUUID(), email, 'constraint-only']);
    await rejectedStatement(client, sql, [randomUUID(), ` ${email.toUpperCase()} `, 'constraint-only'], '23505');
  } finally { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
});

test('HTTP writes persist in PostgreSQL across fresh connections and passwords are salted hashes', async () => {
  const a = await register(), b = await register();
  let client = await database();
  try {
    const { rows } = await client.query('SELECT id,email,password_hash FROM users WHERE id = ANY($1::uuid[]) ORDER BY id', [[a.user.id, b.user.id]]);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(typeof row.password_hash, 'string');
      assert.ok(row.password_hash.length >= 32);
      assert.ok(!row.password_hash.includes(password));
      assert.notEqual(row.password_hash, Buffer.from(password).toString('base64'));
    }
    assert.notEqual(rows[0].password_hash, rows[1].password_hash, 'Identical passwords must have distinct salted hashes');
    const contact = await call('/contacts', { name: 'Persisted Contact', email: 'persisted@example.com', country: 'PA', phone: '61234567' }, a.accessToken);
    assert.equal(contact.status, 201, JSON.stringify(contact.data));
    await client.end();
    client = await database();
    const saved = await client.query('SELECT user_id, phone_e164, deleted_at FROM contacts WHERE id = $1', [contact.data.id]);
    assert.equal(saved.rows.length, 1);
    assert.equal(saved.rows[0].user_id, a.user.id);
    assert.equal(saved.rows[0].phone_e164, '+50761234567');
    assert.equal(saved.rows[0].deleted_at, null);
  } finally { await client.end(); }
});

test('refresh credentials are hashed at rest, rotated durably and logout persists revocation', async () => {
  const account = await register();
  const client = await database();
  try {
    const session = async () => {
      const { rows } = await client.query('SELECT refresh_hash, expires_at, revoked_at FROM auth_sessions WHERE user_id = $1', [account.user.id]);
      assert.equal(rows.length, 1);
      return rows[0];
    };
    const before = await session();
    assert.equal(typeof before.refresh_hash, 'string');
    assert.ok(before.refresh_hash.length >= 32);
    assert.ok(!before.refresh_hash.includes(account.refreshToken));
    assert.notEqual(before.refresh_hash, Buffer.from(account.refreshToken).toString('base64'));
    assert.equal(before.revoked_at, null);
    assert.ok(Math.abs(new Date(before.expires_at).getTime() - Date.now() - 7 * 24 * 60 * 60 * 1000) < 30000);
    const rotated = await call('/auth/refresh', { refreshToken: account.refreshToken });
    assert.equal(rotated.status, 200, JSON.stringify(rotated.data));
    const after = await session();
    assert.notEqual(after.refresh_hash, before.refresh_hash);
    assert.ok(!after.refresh_hash.includes(rotated.data.refreshToken));
    assert.equal(new Date(after.expires_at).getTime(), new Date(before.expires_at).getTime());
    assert.equal((await call('/auth/logout', { refreshToken: rotated.data.refreshToken })).status, 204);
    assert.ok(Number.isFinite(new Date((await session()).revoked_at).getTime()));
    assert.notEqual((await session()).revoked_at, null);
  } finally { await client.end(); }
});
