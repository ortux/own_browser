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

  const applySocialCallback = async (payload: { tokens: { access_token: string; refresh_token: string; token_type?: string; expires_in: number }; user: { id?: number; email?: string; name?: string; role?: string; created_at?: string } }) => {
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
      if (event.origin && event.origin !== window.location.origin && event.origin !== 'null') return;
      
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
    () => (currentMode === 'signin'
      ? 'Continue to your synchronized browser profile.'
      : 'Start syncing your browser profile securely.'),
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
      const payload = currentMode === 'signup'
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
      setStatus(message.includes('Failed to fetch') ? `Cannot reach the backend at ${useSettingsStore.getState().authBaseUrl}.` : message);
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
      setStatus(message.includes('Failed to fetch')
        ? `Cannot reach the auth backend at ${useSettingsStore.getState().authBaseUrl || API_BASE}.`
        : message);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleDeviceNameSubmit = async (deviceName: string) => {
    if (!authTokens) return;
    try {
      await useSettingsStore.getState().registerDevice(deviceName, authTokens.access_token);
      setShowDeviceModal(false);
      window.setTimeout(() => onClose(), 300);
    } catch (error) {
      // Error is already handled in registerDevice, just re-throw for modal to display
      throw error;
    }
  };

  return (
    <div className="h-full w-full bg-[#090a0b] text-white">
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden border-r border-white/10 bg-[#111315] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center bg-[#c9f36b] font-mono text-sm font-medium text-[#090a0b]">Z</span>
              <span className="font-mono text-xs tracking-[0.28em] text-white">ZYPHORA</span>
            </div>
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9f36b]">Private by design</p>
            <h1 className="max-w-sm text-4xl font-extrabold leading-[1.08] tracking-[-0.04em]">Your web,<br />in sync.</h1>
            <p className="mt-6 max-w-xs text-sm leading-7 text-zinc-400">One secure home for your browsing history, preferences, and every device you use.</p>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-[#c9f36b]" /> End-to-end account control
          </div>
        </div>

        <div className="flex flex-col px-6 py-5 sm:px-10 sm:py-8">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center bg-[#c9f36b] font-mono text-sm font-medium text-[#090a0b]">Z</span>
              <span className="font-mono text-[10px] tracking-[0.24em]">ZYPHORA</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              Close
            </button>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-[-0.04em]">{title}</h2>
            <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>
          </div>

          <div className="mb-7 grid grid-cols-2 border-b border-white/10">
            <button
              type="button"
              onClick={() => setCurrentMode('signin')}
              className={`border-b-2 pb-3 text-sm font-semibold ${currentMode === 'signin' ? 'border-[#c9f36b] text-white' : 'border-transparent text-zinc-600'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setCurrentMode('signup')}
              className={`border-b-2 pb-3 text-sm font-semibold ${currentMode === 'signup' ? 'border-[#c9f36b] text-white' : 'border-transparent text-zinc-600'}`}
            >
              Create account
            </button>
          </div>

          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="h-px flex-1 bg-white/10" />
              <span>Or continue with</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleSocialClick('google')}
                disabled={socialLoading !== null}
                className="flex items-center justify-center border border-white/10 bg-[#090a0b] px-3 py-2.5 text-xs font-semibold text-white transition hover:border-[#c9f36b] hover:text-[#c9f36b] disabled:cursor-wait disabled:opacity-60"
              >
                {socialLoading === 'google' ? 'Opening Google...' : 'Google'}
              </button>
              <button
                type="button"
                onClick={() => void handleSocialClick('github')}
                disabled={socialLoading !== null}
                className="flex items-center justify-center border border-white/10 bg-[#090a0b] px-3 py-2.5 text-xs font-semibold text-white transition hover:border-[#c9f36b] hover:text-[#c9f36b] disabled:cursor-wait disabled:opacity-60"
              >
                {socialLoading === 'github' ? 'Opening GitHub...' : 'GitHub'}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {currentMode === 'signup' && (
              <div>
                <label htmlFor="zyphora-name" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Display name</label>
                <input
                  id="zyphora-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full border border-white/10 bg-[#090a0b] px-4 py-3.5 text-sm text-white placeholder:text-zinc-700 focus:border-[#c9f36b] focus:outline-none focus:ring-2 focus:ring-[#c9f36b]/20"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label htmlFor="zyphora-email" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Email address</label>
              <input
                id="zyphora-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-white/10 bg-[#090a0b] px-4 py-3.5 text-sm text-white placeholder:text-zinc-700 focus:border-[#c9f36b] focus:outline-none focus:ring-2 focus:ring-[#c9f36b]/20"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="zyphora-password" className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Password</label>
                <span className="font-mono text-[10px] text-zinc-700">12+ characters</span>
              </div>
              <div className="relative">
                <input
                  id="zyphora-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-white/10 bg-[#090a0b] px-4 py-3.5 pr-16 text-sm text-white placeholder:text-zinc-700 focus:border-[#c9f36b] focus:outline-none focus:ring-2 focus:ring-[#c9f36b]/20"
                  placeholder="Enter your password"
                  autoComplete={currentMode === 'signin' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-[#c9f36b]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {status && (
              <p className="rounded border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs leading-5 text-red-300">
                {status}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 bg-[#c9f36b] px-5 py-4 text-sm font-bold text-[#090a0b] transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
            >
              <span>{loading ? 'Connecting...' : currentMode === 'signin' ? 'Sign in to Zyphora' : 'Create my account'}</span>
              <span aria-hidden="true">-&gt;</span>
            </button>
          </form>

          <p className="mt-8 text-center font-mono text-[10px] leading-5 tracking-wide text-zinc-600">By continuing, you agree to keep your account secure.</p>
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
