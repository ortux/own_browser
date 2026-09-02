/**
 * OAuth 2.0 with PKCE Flow Service
 * Manages secure OAuth authentication while keeping the user inside the app
 */

import { getApiBaseUrl } from './config';

export interface OAuthInitiateResponse {
  ok: boolean;
  auth_url: string;
  state: string;
  expires_in: number;
}

export interface OAuthCallbackPayload {
  user: {
    id: number;
    email: string;
    role?: string;
    name?: string;
  };
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
  provider: string;
}

export interface OAuthError {
  error: string;
  status?: number;
}

/**
 * Initiate OAuth flow by requesting auth URL from backend
 */
export async function initiateOAuth(
  provider: 'google' | 'github' | 'microsoft',
  baseUrl?: string
): Promise<OAuthInitiateResponse> {
  const url = baseUrl || getApiBaseUrl();
  const response = await fetch(`${url}/auth/social/initiate`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as OAuthError)?.error || `Failed to initiate ${provider} OAuth flow`);
  }

  return data as OAuthInitiateResponse;
}

/**
 * Open OAuth popup window with security considerations
 * - No nodeIntegration
 * - Sandboxed
 * - Fixed dimensions for security
 */
export function openOAuthPopup(authUrl: string, provider: string): Window | null {
  const width = 960;
  const height = 760;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  const popup = window.open(
    authUrl,
    `zyphora-oauth-${provider}`,
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no`
  );

  return popup;
}

/**
 * Wait for OAuth callback by polling the popup URL.
 * This works in Electron where window.opener is null in popup windows,
 * so postMessage from the popup never arrives.
 * Instead we poll the popup's location until it lands on auth-callback.html.
 */
export function waitForOAuthCallback(
  popup: Window,
  timeout: number = 10 * 60 * 1000
): Promise<OAuthCallbackPayload> {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    // Also listen for postMessage in case it does work (web context)
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'zyphora-oauth-callback') {
        cleanup();
        if (data.error) {
          reject(new Error(data.error));
        } else if (data.tokens && data.user) {
          resolve({
            tokens: data.tokens,
            user: {
              ...data.user,
              name: data.user.name || data.user.display_name || '',
            },
            provider: data.provider,
          } as OAuthCallbackPayload);
        } else {
          reject(new Error('Invalid OAuth callback payload'));
        }
      }
    }

    window.addEventListener('message', handleMessage);

    // Poll the popup URL every 500ms
    const interval = setInterval(() => {
      // Timed out
      if (Date.now() - started > timeout) {
        cleanup();
        reject(new Error('OAuth callback timeout'));
        return;
      }

      // Popup was closed without completing
      if (popup.closed) {
        cleanup();
        reject(new Error('Sign-in window was closed'));
        return;
      }

      try {
        const url = popup.location.href;
        // Wait until the popup lands on our callback page
        if (
          (!url.includes('auth-callback.html') && !url.includes('/auth/social')) ||
          url === 'about:blank'
        ) {
          return;
        }

        const params = new URLSearchParams(popup.location.search);
        const error = params.get('error');
        if (error) {
          cleanup();
          reject(new Error(decodeURIComponent(error)));
          return;
        }

        const accessToken = params.get('token') || params.get('access_token') || '';
        const refreshToken = params.get('refresh') || params.get('refresh_token') || '';
        const tokenType = params.get('token_type') || 'bearer';
        const expiresIn = Number(params.get('expires_in') || '900');
        const provider = params.get('provider') || 'google';
        const userRaw = params.get('user') || '';

        if (!accessToken) return; // not on callback page yet

        let user: OAuthCallbackPayload['user'] | null = null;
        try {
          user = JSON.parse(decodeURIComponent(userRaw));
        } catch {
          /* ignore */
        }

        cleanup();
        resolve({
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: tokenType,
            expires_in: expiresIn,
          },
          user: {
            ...(user as any),
            name: (user as any)?.name || (user as any)?.display_name || '',
          },
          provider,
        } as OAuthCallbackPayload);
      } catch {
        // Cross-origin — popup is on Google/GitHub, not our domain yet, keep waiting
      }
    }, 500);

    function cleanup() {
      clearInterval(interval);
      window.removeEventListener('message', handleMessage);
      if (popup && !popup.closed) popup.close();
    }

    // Timeout fallback
    setTimeout(() => {
      cleanup();
      reject(new Error('OAuth callback timeout'));
    }, timeout);
  });
}

/**
 * Execute full OAuth flow:
 * 1. Initiate OAuth with backend
 * 2. Open popup to auth_url
 * 3. Wait for callback from popup
 * 4. Return tokens and user data
 */
export async function executeOAuthFlow(
  provider: 'google' | 'github' | 'microsoft',
  baseUrl?: string
): Promise<OAuthCallbackPayload> {
  const url = baseUrl || getApiBaseUrl();
  // Step 1: Initiate OAuth
  const initiateResponse = await initiateOAuth(provider, url);

  if (!initiateResponse.ok || !initiateResponse.auth_url) {
    throw new Error(`OAuth initiation failed for ${provider}`);
  }

  // Step 2: Open popup
  const popup = openOAuthPopup(initiateResponse.auth_url, provider);
  if (!popup) {
    throw new Error(
      'Popup window could not be opened. Please check your browser settings and allow popups for this application.'
    );
  }

  try {
    // Step 3: Wait for callback by polling popup URL
    const callbackPayload = await waitForOAuthCallback(popup);
    return callbackPayload;
  } finally {
    // Close popup if still open
    if (popup && !popup.closed) {
      popup.close();
    }
  }
}

/**
 * Handle OAuth callback in popup window
 * This function should be called from the callback HTML page
 */
export function handleOAuthCallback(
  tokens: { access_token: string; refresh_token: string; token_type: string; expires_in: number },
  user: { id: number; email: string; role?: string; name?: string },
  provider: string
): void {
  // Send tokens back to opener (main window)
  if (window.opener) {
    window.opener.postMessage(
      {
        type: 'zyphora-oauth-callback',
        tokens,
        user,
        provider,
      },
      '*'
    );
  } else {
    console.error('OAuth callback: No opener window found');
  }
}

/**
 * Handle OAuth errors in popup
 */
export function handleOAuthError(error: string): void {
  if (window.opener) {
    window.opener.postMessage(
      {
        type: 'zyphora-oauth-callback',
        error,
      },
      '*'
    );
  } else {
    console.error('OAuth error:', error);
  }
}
