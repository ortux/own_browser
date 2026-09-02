import { useState, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProxyInfo } from '../stores/settingsStore';

type ProxyStatus = 'idle' | 'fetching' | 'verifying' | 'active' | 'failed';

export function useProxy() {
  const proxy = useSettingsStore((s) => s.proxy);
  const proxyEnabled = useSettingsStore((s) => s.proxyEnabled);
  const setProxy = useSettingsStore((s) => s.setProxy);
  const setProxyEnabled = useSettingsStore((s) => s.setProxyEnabled);

  const [status, setStatus] = useState<ProxyStatus>(proxyEnabled && proxy ? 'active' : 'idle');
  const [error, setError] = useState<string | null>(null);

  /** Fetch a new proxy, verify it, and apply it to the session. */
  const fetchAndApply = useCallback(async () => {
    setStatus('fetching');
    setError(null);
    try {
      // fetchProxy is synchronous on the main side — IPC returns immediately
      const p: ProxyInfo = await window.browserAPI.proxy.fetch();
      setStatus('verifying');
      await window.browserAPI.proxy.apply(p);
      const working = await window.browserAPI.proxy.verify(p);
      if (!working) {
        await window.browserAPI.proxy.clear().catch(() => {});
        throw new Error(
          'The selected proxy did not respond. Browsing remains on the direct connection.'
        );
      }
      setProxy(p);
      setProxyEnabled(true);
      setStatus('active');
    } catch (e: unknown) {
      await window.browserAPI.proxy.clear().catch(() => {});
      setProxy(null);
      setProxyEnabled(false);
      setError(e instanceof Error ? e.message : 'Failed to apply proxy');
      setStatus('failed');
    }
  }, [setProxy, setProxyEnabled]);

  /** Disable the proxy and restore direct connection. */
  const disable = useCallback(async () => {
    try {
      await window.browserAPI.proxy.clear();
    } catch {
      /* best-effort */
    }
    setProxyEnabled(false);
    setStatus('idle');
    setError(null);
  }, [setProxyEnabled]);

  /** Toggle: if enabled disable, if disabled fetch+apply. */
  const toggle = useCallback(async () => {
    if (proxyEnabled) await disable();
    else await fetchAndApply();
  }, [proxyEnabled, disable, fetchAndApply]);

  return { proxy, proxyEnabled, status, error, fetchAndApply, disable, toggle };
}
