import { app } from 'electron';
import { readJsonFile, writeJsonFile, isRecord } from './jsonStore';

const ADGUARD_DOH_ENDPOINT = 'https://dns.adguard-dns.com/dns-query';
const FILENAME = 'dns.json';

export type DnsMode = 'automatic' | 'secure';

/**
 * Read the persisted DoH mode.
 *
 * Chromium reads the DNS switches during startup, before any renderer exists,
 * so this setting cannot live in the renderer's zustand store like the others
 * — it has to be on disk and readable synchronously before app ready. The
 * environment variable still wins, for scripted/enterprise use.
 */
export function getDnsMode(): DnsMode {
  if (process.env.ZYPHORA_DNS_MODE === 'secure') return 'secure';
  if (process.env.ZYPHORA_DNS_MODE === 'automatic') return 'automatic';
  const parsed = readJsonFile(FILENAME);
  if (isRecord(parsed) && parsed.mode === 'secure') return 'secure';
  return 'automatic';
}

/** Persist the DoH mode. Takes effect on the next launch. */
export function setDnsMode(mode: DnsMode): void {
  writeJsonFile(FILENAME, { mode });
}

/**
 * Configure Chromium's DNS-over-HTTPS resolver.
 *
 * `secure` mode is tempting for a privacy browser, but it is fail-closed: if
 * the DoH endpoint is blocked or temporarily unavailable, every webview URL
 * fails DNS resolution. That failure used to leave a dark/empty tab with no
 * useful indication of why a link did not open. `automatic` still prefers the
 * configured resolver while allowing Chromium to fall back to the system DNS
 * when the resolver cannot be reached. Users who want fail-closed DNS can turn
 * on strict mode in Settings (or set ZYPHORA_DNS_MODE=secure); both are read
 * by getDnsMode() below and applied on the next launch.
 *
 * This must run before app readiness because Chromium command-line switches
 * are read during startup.
 */
export function configureAdGuardDns(): void {
  app.commandLine.appendSwitch('dns-over-https-servers', ADGUARD_DOH_ENDPOINT);
  app.commandLine.appendSwitch('dns-over-https-mode', getDnsMode());
}

export function getAdGuardDnsEndpoint(): string {
  return ADGUARD_DOH_ENDPOINT;
}
