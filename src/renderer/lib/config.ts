const DEFAULT_API_BASE_URL = 'https://api-zyphora.obliqllc.xyz';

export function getApiBaseUrl(): string {
  const fromEnv =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.API_BASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
    (typeof process !== 'undefined' && process.env?.API_BAE_URL) ||
    (typeof window !== 'undefined' && (window as any).__API_BASE_URL__);

  return (fromEnv ? String(fromEnv).trim() : '') || DEFAULT_API_BASE_URL;
}
