/**
 * API Client with Automatic Token Management
 * Handles authentication headers and automatic token refresh
 */

import { ensureValidToken, clearTokens } from './tokenManager';
import { getApiBaseUrl } from './config';

export interface ApiRequestOptions extends RequestInit {
  requireAuth?: boolean;
  baseUrl?: string;
  retries?: number;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = getApiBaseUrl()) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Make an API request with automatic authentication and token refresh
   */
  async request<T = unknown>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      requireAuth = true,
      baseUrl = this.baseUrl,
      retries = 1,
      ...fetchOptions
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Ensure we have a valid token if auth is required
        let token: string | null = null;
        if (requireAuth) {
          token = await ensureValidToken(baseUrl);
          if (!token) {
            return {
              ok: false,
              status: 401,
              error: 'Unauthorized - Failed to obtain valid token',
            };
          }
        }

        // Build headers
        const headers = new Headers(fetchOptions.headers ?? {});
        if (!(fetchOptions.body instanceof FormData)) {
          headers.set('Content-Type', 'application/json');
        }
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        // Make request
        const url = `${baseUrl}${path}`;
        const response = await fetch(url, {
          ...fetchOptions,
          headers,
          mode: 'cors',
        });

        // Parse response
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
          // Handle 401 - token might have been invalidated server-side
          if (response.status === 401 && requireAuth && attempt < retries) {
            clearTokens();
            continue; // Retry after clearing tokens (user will need to re-auth)
          }

          return {
            ok: false,
            status: response.status,
            error: data?.error || data?.message || `HTTP ${response.status}`,
            data: data as T,
          };
        }

        return {
          ok: true,
          status: response.status,
          data: data as T,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on network errors immediately
        if (attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          await new Promise(resolve =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    return {
      ok: false,
      status: 0,
      error: lastError?.message || 'Request failed',
    };
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
