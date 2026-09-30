import { describe, expect, it, vi } from 'vitest';
import { createSessionManager } from './session';

const initial = { accessToken: 'access-old', refreshToken: 'refresh-old', user: { id: 'user-a', email: 'a@example.com' } };
const rotated = { ...initial, accessToken: 'access-new', refreshToken: 'refresh-new' };
function storage(): Storage {
  const items = new Map<string, string>();
  return { get length() { return items.size; }, key: index => [...items.keys()][index] ?? null, getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: key => { items.delete(key); }, clear: () => items.clear() };
}
function pending<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe('session lifecycle requirements', () => {
  it('persists and recovers only complete valid session shapes', () => {
    const saved = storage(), request = vi.fn(); const manager = createSessionManager({ storage: saved, request });
    expect(manager.get()).toBeNull(); manager.set(initial);
    expect(JSON.parse(saved.getItem('cerca-session')!)).toEqual(initial);
    expect(createSessionManager({ storage: saved, request }).get()).toEqual(initial);
    for (const invalid of ['{broken', 'null', '{}', JSON.stringify({ ...initial, refreshToken: '' }), JSON.stringify({ ...initial, user: { email: 'a@example.com' } }), JSON.stringify({ ...initial, accessToken: 12 })]) {
      saved.setItem('cerca-session', invalid);
      expect(createSessionManager({ storage: saved, request }).get()).toBeNull();
    }
  });

  it('refreshes once for simultaneous callers and stores the rotated tokens', async () => {
    const saved = storage(), deferred = pending<typeof rotated>(), request = vi.fn().mockReturnValue(deferred.promise);
    const manager = createSessionManager({ storage: saved, request }); manager.set(initial);
    const a = manager.refresh(), b = manager.refresh();
    expect(request).toHaveBeenCalledTimes(1);
    const [path, options] = request.mock.calls[0]; expect(path).toBe('/auth/refresh'); expect(options.method).toBe('POST'); expect(JSON.parse(options.body)).toEqual({ refreshToken: initial.refreshToken });
    deferred.resolve(rotated);
    expect(await a).toEqual(rotated); expect(await b).toEqual(rotated); expect(manager.get()).toEqual(rotated);
  });

  it('clears expired credentials on 401, but retains them after a network outage', async () => {
    const saved = storage(), onClear = vi.fn(), request = vi.fn().mockRejectedValueOnce({ status: 401 }).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const manager = createSessionManager({ storage: saved, request, onClear }); manager.set(initial);
    await expect(manager.refresh()).rejects.toMatchObject({ status: 401 }); expect(manager.get()).toBeNull(); expect(saved.getItem('cerca-session')).toBeNull(); expect(onClear).toHaveBeenCalledTimes(1);
    manager.set(initial); await expect(manager.refresh()).rejects.toThrow('Failed to fetch'); expect(manager.get()).toEqual(initial); expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect a logged-out session when refresh completes late', async () => {
    const deferred = pending<typeof rotated>(), saved = storage(), onClear = vi.fn();
    const manager = createSessionManager({ storage: saved, request: vi.fn().mockReturnValue(deferred.promise), onClear }); manager.set(initial);
    const completion = manager.refresh().catch(() => undefined); manager.clear(); deferred.resolve(rotated); await completion;
    expect(manager.get()).toBeNull(); expect(saved.getItem('cerca-session')).toBeNull(); expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a newly logged-in user with an older refresh response', async () => {
    const deferred = pending<typeof rotated>(), saved = storage();
    const manager = createSessionManager({ storage: saved, request: vi.fn().mockReturnValue(deferred.promise) }); manager.set(initial);
    const completion = manager.refresh().catch(() => undefined);
    const other = { accessToken: 'other-access', refreshToken: 'other-refresh', user: { id: 'user-b', email: 'b@example.com' } }; manager.set(other);
    deferred.resolve(rotated); await completion; expect(manager.get()).toEqual(other);
  });

  it('a late 401 from an old refresh cannot log out a newly authenticated user', async () => {
    const deferred = pending<typeof rotated>(), saved = storage(), onClear = vi.fn();
    const manager = createSessionManager({ storage: saved, request: vi.fn().mockReturnValue(deferred.promise), onClear }); manager.set(initial);
    const completion = manager.refresh().catch(() => undefined);
    const other = { accessToken: 'other-access', refreshToken: 'other-refresh', user: { id: 'user-b', email: 'b@example.com' } }; manager.set(other);
    deferred.reject({ status: 401 }); await completion; expect(manager.get()).toEqual(other); expect(onClear).not.toHaveBeenCalled();
  });
});
