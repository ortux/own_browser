export interface AuthUser {
  id: number;
  email: string;
  role?: string;
  created_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RefreshResponse {
  tokens: AuthTokens;
}

export interface DevicePayload {
  device_key: string;
  name: string;
}

export interface DeviceResponse {
  device: {
    id: number;
    device_key: string;
    name: string;
    last_seen_at: string;
  };
}

export interface HistoryEventPayload {
  client_event_id: string;
  url: string;
  title: string;
  visited_at: string;
}

export interface HistoryResponse {
  accepted: number;
  received: number;
}

export interface HistoryEntry {
  id: number;
  device_id: number;
  client_event_id: string;
  url: string;
  title: string;
  visited_at: string;
}

export interface BookmarkPayload {
  bookmark_id: string;
  title: string;
  url: string;
}

export interface BookmarkEntry extends BookmarkPayload {
  id: number;
  device_id: number;
  updated_at: string;
}

export interface SettingsMap {
  [key: string]: unknown;
}

export interface UserSettingsResponse {
  settings: SettingsMap;
  updated_at?: string;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AuthApiClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error;
  }
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }
  return fallback;
}

export function createAuthApiClient({ baseUrl, fetchImpl = fetch }: AuthApiClientOptions) {
  const normalizeBase = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (!(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetchImpl(`${normalizeBase}${path}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `Request failed with status ${response.status}`));
    }

    return payload as T;
  }

  return {
    register: async (body: RegisterRequest): Promise<AuthResponse> =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

    login: async (body: LoginRequest): Promise<AuthResponse> =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

    refreshToken: async (refreshToken: string): Promise<RefreshResponse> =>
      request<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),

    me: async (token: string) =>
      request<{ user: AuthUser }>('/api/v1/me', { method: 'GET' }, token),

    linkDevice: async (body: DevicePayload, token: string): Promise<DeviceResponse> =>
      request<DeviceResponse>(
        '/api/v1/devices',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        token
      ),

    syncHistory: async (
      body: { device_key: string; events: HistoryEventPayload[] },
      token: string
    ): Promise<HistoryResponse> =>
      request<HistoryResponse>(
        '/api/v1/sync/history',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        token
      ),

    getHistory: async (token: string, limit = 100): Promise<{ events: HistoryEntry[] }> =>
      request<{ events: HistoryEntry[] }>(
        `/api/v1/sync/history?limit=${limit}`,
        { method: 'GET' },
        token
      ),

    syncBookmarks: async (
      body: { device_key: string; bookmarks: BookmarkPayload[] },
      token: string
    ): Promise<HistoryResponse> =>
      request<HistoryResponse>(
        '/api/v1/sync/bookmarks',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        token
      ),

    getBookmarks: async (token: string, limit = 200): Promise<{ bookmarks: BookmarkEntry[] }> =>
      request<{ bookmarks: BookmarkEntry[] }>(
        `/api/v1/sync/bookmarks?limit=${limit}`,
        { method: 'GET' },
        token
      ),

    saveSettings: async (settings: SettingsMap, token: string): Promise<UserSettingsResponse> =>
      request<UserSettingsResponse>(
        '/api/v1/sync/settings',
        {
          method: 'PUT',
          body: JSON.stringify({ settings }),
        },
        token
      ),

    getSettings: async (token: string): Promise<UserSettingsResponse> =>
      request<UserSettingsResponse>('/api/v1/sync/settings', { method: 'GET' }, token),
  };
}
