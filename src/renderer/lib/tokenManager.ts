/**
 * Token Management Service
 * Handles token storage, refresh, expiration checking, and secure access
 */

import { getApiBaseUrl } from './config';

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number; // Unix timestamp in ms when token expires
}

const TOKENS_STORAGE_KEY = 'zyphora_tokens_v2';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh if expires in < 5 minutes

/**
 * Save tokens to secure storage (encrypted by electron-store)
 */
export function saveTokens(tokens: {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
}): void {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type ?? 'Bearer',
    expires_at: expiresAt,
  };
  localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Get stored tokens from storage
 */
export function getStoredTokens(): StoredTokens | null {
  const stored = localStorage.getItem(TOKENS_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as StoredTokens;
  } catch {
    return null;
  }
}

/**
 * Get current access token (valid and not expired)
 * Returns null if no token or token expired
 */
export function getAccessToken(): string | null {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // Check if token is expired or about to expire
  if (Date.now() > tokens.expires_at - TOKEN_REFRESH_BUFFER_MS) {
    return null; // Token is expired, needs refresh
  }

  return tokens.access_token;
}

/**
 * Check if we need to refresh the token
 */
export function needsTokenRefresh(): boolean {
  const tokens = getStoredTokens();
  if (!tokens) return false;

  // Need refresh if token expires in less than buffer time
  return Date.now() > tokens.expires_at - TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Refresh token using refresh_token
 * Returns new tokens on success, null if refresh fails
 */
export async function refreshAccessToken(
  baseUrl: string = getApiBaseUrl()
): Promise<{
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
} | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) {
    console.debug('[token] No refresh token available');
    return null;
  }

  try {
    console.debug('[token] Attempting to refresh access token');
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });

    if (response.status === 401 || response.status === 403) {
      console.debug('[token] Refresh failed with 401/403 - logging out');
      clearTokens();
      return null;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('[token] Token refresh failed:', error);
      return null;
    }

    const data = await response.json();
    if (data.tokens) {
      saveTokens(data.tokens);
      console.debug('[token] Token refreshed successfully');
      return data.tokens;
    }

    return null;
  } catch (error) {
    console.error('[token] Token refresh error:', error);
    return null;
  }
}

/**
 * Ensure we have a valid access token, refreshing if needed
 * Returns valid token or null if refresh fails
 */
export async function ensureValidToken(
  baseUrl: string = getApiBaseUrl()
): Promise<string | null> {
  let token = getAccessToken();
  if (token) {
    return token; // Token is still valid
  }

  // Try to refresh
  const refreshed = await refreshAccessToken(baseUrl);
  if (refreshed) {
    return refreshed.access_token;
  }

  return null;
}

/**
 * Clear all stored tokens (on logout or auth failure)
 */
export function clearTokens(): void {
  localStorage.removeItem(TOKENS_STORAGE_KEY);
  localStorage.removeItem('zyphora_tokens'); // Clear old format tokens
}

/**
 * Get token expiration time in seconds from now
 * Returns negative number if expired
 */
export function getTokenExpiresIn(): number {
  const tokens = getStoredTokens();
  if (!tokens) return -1;

  const expiresIn = (tokens.expires_at - Date.now()) / 1000;
  return Math.max(0, Math.floor(expiresIn));
}

/**
 * Check if we have valid stored tokens
 */
export function hasValidTokens(): boolean {
  return getAccessToken() !== null;
}
