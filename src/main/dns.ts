import { app } from 'electron';

const ADGUARD_DOH_ENDPOINT = 'https://dns.adguard-dns.com/dns-query';

export function configureAdGuardDns(): void {
  app.commandLine.appendSwitch('dns-over-https-servers', ADGUARD_DOH_ENDPOINT);
  app.commandLine.appendSwitch('dns-over-https-mode', 'secure');
}

export function getAdGuardDnsEndpoint(): string {
  return ADGUARD_DOH_ENDPOINT;
}
