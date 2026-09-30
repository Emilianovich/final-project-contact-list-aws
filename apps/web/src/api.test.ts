import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './api';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
describe('HTTP adapter contract', () => {
  it('sends Bearer credentials, JSON and combined query without cookie auth', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ items: [] }));
    const client = createApiClient({ baseUrl: 'http://localhost:3001', getAccessToken: () => 'access-token', onUnauthorized: vi.fn(), fetch: fetcher });
    expect(await client.request('/contacts?q=Ana&country=PA')).toEqual({ items: [] });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3001/contacts?q=Ana&country=PA');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token');
    expect(init.credentials).toBe('omit');
  });
  it('does not emit a bearer header when unauthenticated', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ accessToken: 'new' }));
    const client = createApiClient({ baseUrl: 'http://localhost:3001/', getAccessToken: () => null, onUnauthorized: vi.fn(), fetch: fetcher });
    await client.request('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@example.com', password: 'password' }) });
    expect(String(fetcher.mock.calls[0][0])).toBe('http://localhost:3001/auth/login');
    const headers = new Headers(fetcher.mock.calls[0][1].headers); expect(headers.has('Authorization')).toBe(false); expect(headers.get('Content-Type')).toBe('application/json');
  });
  it('surfaces duplicate identity without losing structured error semantics', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ code: 'PHONE_DELETED', message: 'En papelera', contactId: 'owned-id' }, 409));
    const client = createApiClient({ baseUrl: 'http://localhost:3001', getAccessToken: () => 'token', onUnauthorized: vi.fn(), fetch: fetcher });
    await expect(client.request('/contacts')).rejects.toMatchObject({ status: 409, code: 'PHONE_DELETED', message: 'En papelera', contactId: 'owned-id' });
    await expect(client.request('/contacts')).rejects.toBeInstanceOf(ApiError);
  });
  it('notifies session controller on unauthorized responses without retrying indefinitely', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ code: 'UNAUTHORIZED', message: 'Sesión vencida' }, 401)); const onUnauthorized = vi.fn();
    const client = createApiClient({ baseUrl: 'http://localhost:3001', getAccessToken: () => 'expired', onUnauthorized, fetch: fetcher });
    await expect(client.request('/contacts')).rejects.toMatchObject({ status: 401 }); expect(onUnauthorized).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('handles empty logout responses and does not discard sessions on server errors', async () => {
    const onUnauthorized = vi.fn(); const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(response({ code: 'INTERNAL_ERROR', message: 'Error' }, 500));
    const client = createApiClient({ baseUrl: 'http://localhost:3001', getAccessToken: () => 'token', onUnauthorized, fetch: fetcher });
    expect(await client.request('/auth/logout', { method: 'POST' })).toBeUndefined();
    await expect(client.request('/contacts')).rejects.toMatchObject({ status: 500 }); expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
