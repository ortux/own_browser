import { app } from 'electron';

const ADGUARD_DOH_ENDPOINT = 'https://dns.adguard-dns.com/dns-query';

/**
 * Configure Chromium's DNS-over-HTTPS resolver.
 *
 * `secure` mode is tempting for a privacy browser, but it is fail-closed: if
 * the DoH endpoint is blocked or temporarily unavailable, every webview URL
 * fails DNS resolution. That failure used to leave a dark/empty tab with no
 * useful indication of why a link did not open. `automatic` still prefers the
 * configured resolver while allowing Chromium to fall back to the system DNS
 * when the resolver cannot be reached. Set ZYPHORA_DNS_MODE=secure when a user
 * explicitly wants fail-closed DNS and has verified that the endpoint works.
 *
 * This must run before app readiness because Chromium command-line switches
 * are read during startup.
 */
export function configureAdGuardDns(): void {
  app.commandLine.appendSwitch('dns-over-https-servers', ADGUARD_DOH_ENDPOINT);
  const mode = process.env.ZYPHORA_DNS_MODE === 'secure' ? 'secure' : 'automatic';
  app.commandLine.appendSwitch('dns-over-https-mode', mode);
}

export function getAdGuardDnsEndpoint(): string {
  return ADGUARD_DOH_ENDPOINT;
}

export function getDnsMode(): 'automatic' | 'secure' {
  return process.env.ZYPHORA_DNS_MODE === 'secure' ? 'secure' : 'automatic';
}
