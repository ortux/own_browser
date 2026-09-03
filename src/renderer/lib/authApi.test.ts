import assert from 'node:assert/strict';
import test from 'node:test';
import { getApiBaseUrl } from './config';
import { createAuthApiClient } from './authApi';

function makeMockFetch() {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const queue: Array<{ ok: boolean; body: unknown; status?: number }> = [];

  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    const next = queue.shift();
    if (!next) {
      throw new Error('No queued mock response');
    }
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 400),
      async json() {
        return next.body;
      },
      async text() {
        return JSON.stringify(next.body);
      },
    } as Response;
  };

  return {
    fetchMock,
    queue,
    calls,
  };
}

test('auth base URL falls back to the production API when unconfigured', () => {
  delete process.env.VITE_API_BASE_URL;
  delete process.env.API_BASE_URL;
  assert.equal(getApiBaseUrl(), 'https://api-zyphora.obliqllc.xyz');
});

test('auth base URL is overridable through the environment', () => {
  process.env.API_BASE_URL = 'http://localhost:8080';
  try {
    assert.equal(getApiBaseUrl(), 'http://localhost:8080');
  } finally {
    delete process.env.API_BASE_URL;
  }
});

test('auth base URL trims surrounding whitespace', () => {
  process.env.VITE_API_BASE_URL = '  https://staging.example.com  ';
  try {
    assert.equal(getApiBaseUrl(), 'https://staging.example.com');
  } finally {
    delete process.env.VITE_API_BASE_URL;
  }
});

test('auth client sends register payload and stores token data', async () => {
  const { fetchMock, queue } = makeMockFetch();
  queue.push({
    ok: true,
    body: {
      user: { id: 1, email: 'user@example.com' },
      tokens: {
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        token_type: 'Bearer',
        expires_in: 900,
      },
    },
  });

  const client = createAuthApiClient({ baseUrl: getApiBaseUrl(), fetchImpl: fetchMock });
  const response = await client.register({
    email: 'user@example.com',
    password: 'StrongPassword123',
  });

  assert.equal(response.user.email, 'user@example.com');
  assert.equal(response.tokens.access_token, 'access-123');
});

test('auth client surfaces human-readable errors from login failures', async () => {
  const { fetchMock, queue } = makeMockFetch();
  queue.push({
    ok: false,
    body: { error: 'Invalid credentials' },
    status: 401,
  });

  const client = createAuthApiClient({ baseUrl: getApiBaseUrl(), fetchImpl: fetchMock });
  await assert.rejects(
    () => client.login({ email: 'user@example.com', password: 'wrongpass' }),
    /Invalid credentials/
  );
});

test('auth client keeps device key and tokens in sync while refreshing', async () => {
  const { fetchMock, queue } = makeMockFetch();
  queue.push({
    ok: true,
    body: {
      tokens: {
        access_token: 'next-access',
        refresh_token: 'next-refresh',
        token_type: 'Bearer',
        expires_in: 900,
      },
    },
  });

  const client = createAuthApiClient({ baseUrl: getApiBaseUrl(), fetchImpl: fetchMock });
  const response = await client.refreshToken('refresh-123');

  assert.equal(response.tokens.access_token, 'next-access');
  assert.equal(response.tokens.refresh_token, 'next-refresh');
});
