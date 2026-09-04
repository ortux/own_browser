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

const FIELD_CLASS =
  'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[15px] text-[var(--text)] placeholder:text-[var(--text-faint)] transition-all duration-200 focus:border-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent)]/10 focus:bg-[var(--bg)]';

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
    saveTokens(payload.tokens);
    await useSettingsStore.getState().applyAuthSession(payload);
    setAuthTokens({ access_token: payload.tokens.access_token });

    const deviceName = useSettingsStore.getState().deviceName;
    if (!deviceName) {
      setShowDeviceModal(true);
    } else {
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

      if (data.type === 'zyphora-oauth-callback' && data.tokens && data.user) {
        await applySocialCallback(data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const title = useMemo(
    () => (currentMode === 'signin' ? 'Welcome back' : 'Create your account'),
    [currentMode]
  );

  const subtitle = useMemo(
    () =>
      currentMode === 'signin'
        ? 'Sign in to access your synced browser profile.'
        : 'Set up your account to sync across devices.',
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

      if (data?.tokens) {
        saveTokens(data.tokens);
        setAuthTokens({ access_token: data.tokens.access_token });
      }

      await useSettingsStore.getState().applyAuthSession(data);

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
      const callbackPayload = await executeOAuthFlow(provider, baseUrl);
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
    await useSettingsStore.getState().registerDevice(deviceName, authTokens.access_token);
    setShowDeviceModal(false);
    window.setTimeout(() => onClose(), 300);
  };

  return (
    <div className="relative h-full w-full overflow-y-auto bg-[var(--bg)] text-[var(--text)]">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/5 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[300px] w-[300px] rounded-full bg-[var(--accent)]/3 blur-[100px]" />
      </div>

      <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center px-8 py-12">
        {/* Header with back button */}
        <div className="mb-10">
          <button
            type="button"
            onClick={onClose}
            className="mb-8 inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-none">{title}</h1>
            <p className="mt-2 text-[15px] text-[var(--text-muted)] leading-relaxed">{subtitle}</p>
          </div>
        </div>

        {/* Social providers */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => void handleSocialClick('google')}
            disabled={socialLoading !== null}
            className="group flex items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[14px] font-medium text-[var(--text)] transition-all duration-200 hover:bg-[var(--hover)] hover:border-[var(--border-strong)] hover:shadow-md disabled:cursor-wait disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {socialLoading === 'google' ? 'Opening…' : 'Google'}
          </button>
          <button
            type="button"
            onClick={() => void handleSocialClick('github')}
            disabled={socialLoading !== null}
            className="group flex items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-[14px] font-medium text-[var(--text)] transition-all duration-200 hover:bg-[var(--hover)] hover:border-[var(--border-strong)] hover:shadow-md disabled:cursor-wait disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            {socialLoading === 'github' ? 'Opening…' : 'GitHub'}
          </button>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border)]"></div>
          </div>
          <div className="relative flex justify-center text-[12px]">
            <span className="bg-[var(--bg)] px-4 text-[var(--text-faint)] uppercase tracking-[0.15em] font-semibold">or continue with email</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {currentMode === 'signup' && (
            <div>
              <label htmlFor="zyphora-name" className="mb-2 block text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.15em]">
                Name
              </label>
              <input
                id="zyphora-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label htmlFor="zyphora-email" className="mb-2 block text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.15em]">
              Email address
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
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="zyphora-password" className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.15em]">
                Password
              </label>
              {currentMode === 'signup' && (
                <span className="text-[11px] text-[var(--text-faint)] font-medium">12+ characters</span>
              )}
            </div>
            <div className="relative">
              <input
                id="zyphora-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${FIELD_CLASS} pr-16`}
                placeholder="Enter your password"
                autoComplete={currentMode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--hover)]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Status message */}
          {status && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-4 py-3.5 text-[14px] leading-relaxed text-[var(--danger)]"
            >
              {status}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="relative w-full overflow-hidden rounded-xl bg-[var(--accent)] px-4 py-4 text-[15px] font-semibold text-[var(--accent-text)] transition-all duration-200 hover:brightness-110 hover:shadow-xl hover:shadow-[var(--accent)]/25 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
          >
            <span className={`transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}>
              {currentMode === 'signin' ? 'Sign in' : 'Create account'}
            </span>
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[14px] text-[var(--text-muted)]">
            {currentMode === 'signin' ? (
              <>
                New to Zyphora?{' '}
                <button
                  type="button"
                  onClick={() => setCurrentMode('signup')}
                  className="font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setCurrentMode('signin')}
                  className="font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
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
