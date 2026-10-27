import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('sends the session and CSRF header on writes and stores refreshed tokens', async () => {
    const storage = { getItem: vi.fn(() => 'current-csrf'), setItem: vi.fn() };
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', storage);
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: { id: 'record' },
        requestId: 'req_test',
        csrfToken: 'next-csrf',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest('/admin/records', {
      method: 'POST',
      body: '{}',
    });
    expect(result.data).toEqual({ id: 'record' });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('x-csrf-token')).toBe(
      'current-csrf',
    );
    expect(storage.setItem).toHaveBeenCalledWith('ht_csrf', 'next-csrf');
  });

  it('preserves conflict status and code for form recovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: { code: 'DOCUMENT_CONFLICT', message: '已被修改' },
            requestId: 'req_test',
          },
          { status: 409 },
        ),
      ),
    );
    await expect(apiRequest('/admin/records/id')).rejects.toMatchObject({
      status: 409,
      code: 'DOCUMENT_CONFLICT',
      message: '已被修改',
    });
  });

  it('turns an HTML maintenance response into a recoverable 503 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>internal proxy details</html>', { status: 503 }),
        ),
    );
    await expect(apiRequest('/public/records/token')).rejects.toMatchObject({
      status: 503,
      code: 'INVALID_RESPONSE',
      message: '服务暂时维护中，请稍后重试',
    });
  });

  it.each([null, 'unexpected', { requestId: 'missing-data' }])(
    'rejects malformed success envelopes: %j',
    async (payload) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
      await expect(apiRequest('/public/records/token')).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    },
  );

  it('provides a useful offline error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(apiRequest('/public/records/token')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('preserves intentional cancellation', async () => {
    const error = new DOMException('Cancelled', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(apiRequest('/public/records/token')).rejects.toBe(error);
  });

  it('handles logout without attempting to parse an empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    expect(await apiRequest('/auth/logout', { method: 'POST' })).toMatchObject({
      data: undefined,
    });
  });
});
