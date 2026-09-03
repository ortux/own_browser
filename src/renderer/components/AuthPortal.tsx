import React, { useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../lib/config';
import { useSettingsStore } from '../stores/settingsStore';
import { DeviceNameModal } from './DeviceNameModal';
import { executeOAuthFlow } from '../lib/oauthService';
import { saveTokens } from '../lib/tokenManager';

export type AuthPortalMode = 'signin' | 'signup';

interface AuthPortalProps {
  mode: AuthPortalMode;
  onClose: () => void;
}

const API_BASE = getApiBaseUrl();

/** Every text field in this form shares one appearance. */
const FIELD_CLASS =
  'w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors focus:border-[var(--text-faint)] focus:outline-none';

export const AuthPortal: React.FC<AuthPortalProps> = ({ mode, onClose }) => {
  const [currentMode, setCurrentMode] = useState<AuthPortalMode>(mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [authTokens, setAuthTokens] = useState<{ access_token: string } | null>(null);

  const applySocialCallback = async (payload: {
    tokens: {
      access_token: string;
      refresh_token: string;
      token_type?: string;
      expires_in: number;
    };
    user: { id?: number; email?: string; name?: string; role?: string; created_at?: string };
  }) => {
    // Save tokens using secure token manager
    saveTokens(payload.tokens);

    // Update settings store with user info
    await useSettingsStore.getState().applyAuthSession(payload);
    setAuthTokens({ access_token: payload.tokens.access_token });

    // Only show device modal if this device hasn't been named yet
    const deviceName = useSettingsStore.getState().deviceName;
    if (!deviceName) {
      setShowDeviceModal(true);
    } else {
      // Device already registered — go straight to the browser
      window.setTimeout(() => onClose(), 300);
    }
  };

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (event.origin && event.origin !== window.location.origin && event.origin !== 'null')
        return;

      // Handle OAuth callback from popup
      if (data.type === 'zyphora-oauth-callback' && data.tokens && data.user) {
        await applySocialCallback(data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const title = useMemo(
    () => (currentMode === 'signin' ? 'Sign in' : 'Create account'),
    [currentMode]
  );

  const subtitle = useMemo(
    () =>
      currentMode === 'signin'
        ? 'Continue to your synchronized browser profile.'
        : 'Start syncing your browser profile securely.',
    [currentMode]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);

    if (!email.trim() || !password) {
      setStatus('Enter a valid email and password.');
      return;
    }

    if (currentMode === 'signup' && password.length < 12) {
      setStatus('Password must be at least 12 characters long.');
      return;
    }

    setLoading(true);

    try {
      const baseUrl = useSettingsStore.getState().authBaseUrl || API_BASE;
      const endpoint = `${baseUrl}/auth/${currentMode === 'signup' ? 'register' : 'login'}`;
      const payload =
        currentMode === 'signup'
          ? { email: email.trim(), password, name: name.trim() || undefined }
          : { email: email.trim(), password };

      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to authenticate.');
      }

      // Save tokens using secure token manager
      if (data?.tokens) {
        saveTokens(data.tokens);
        setAuthTokens({ access_token: data.tokens.access_token });
      }

      // Apply auth session (store user info)
      await useSettingsStore.getState().applyAuthSession(data);

      // Only show device modal if this device hasn't been named yet
      const deviceName = useSettingsStore.getState().deviceName;
      if (!deviceName) {
        setShowDeviceModal(true);
      } else {
        window.setTimeout(() => onClose(), 300);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(
        message.includes('Failed to fetch')
          ? `Cannot reach the backend at ${useSettingsStore.getState().authBaseUrl}.`
          : message
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSocialClick = async (provider: 'google' | 'github') => {
    setStatus(null);
    setSocialLoading(provider);

    try {
      const baseUrl = useSettingsStore.getState().authBaseUrl || API_BASE;

      // Execute OAuth flow (handles popup and callback)
      const callbackPayload = await executeOAuthFlow(provider, baseUrl);

      // Apply the authentication session
      await applySocialCallback(callbackPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start social sign-in.';
      setStatus(
        message.includes('Failed to fetch')
          ? `Cannot reach the auth backend at ${useSettingsStore.getState().authBaseUrl || API_BASE}.`
          : message
      );
    } finally {
      setSocialLoading(null);
    }
  };

  const handleDeviceNameSubmit = async (deviceName: string) => {
    if (!authTokens) return;
    // registerDevice already logs; let the error propagate so DeviceNameModal
    // can render it inline.
    await useSettingsStore.getState().registerDevice(deviceName, authTokens.access_token);
    setShowDeviceModal(false);
    window.setTimeout(() => onClose(), 300);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-10">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
          >
            Close
          </button>
        </div>

        {/* Mode switch */}
        <div className="mb-6 grid grid-cols-2 border-b border-[var(--border)]">
          {(['signin', 'signup'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCurrentMode(mode)}
              className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                currentMode === mode
                  ? 'border-[var(--text)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-faint)] hover:text-[var(--text-muted)]'
              }`}
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Social providers */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleSocialClick('google')}
            disabled={socialLoading !== null}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)] disabled:cursor-wait disabled:opacity-50"
          >
            {socialLoading === 'google' ? 'Opening…' : 'Google'}
          </button>
          <button
            type="button"
            onClick={() => void handleSocialClick('github')}
            disabled={socialLoading !== null}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)] disabled:cursor-wait disabled:opacity-50"
          >
            {socialLoading === 'github' ? 'Opening…' : 'GitHub'}
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-[var(--text-faint)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {currentMode === 'signup' && (
            <div>
              <label htmlFor="zyphora-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="zyphora-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label htmlFor="zyphora-email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="zyphora-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_CLASS}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="zyphora-password" className="text-sm font-medium">
                Password
              </label>
              {currentMode === 'signup' && (
                <span className="text-xs text-[var(--text-faint)]">12+ characters</span>
              )}
            </div>
            <div className="relative">
              <input
                id="zyphora-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${FIELD_CLASS} pr-14`}
                placeholder="Enter your password"
                autoComplete={currentMode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {status && (
            <p
              role="alert"
              className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm leading-relaxed text-[var(--danger)]"
            >
              {status}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Connecting…' : currentMode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>

      <DeviceNameModal
        isOpen={showDeviceModal}
        onSubmit={handleDeviceNameSubmit}
        onClose={() => {
          setShowDeviceModal(false);
          onClose();
        }}
      />
    </div>
  );
};
