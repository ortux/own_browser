import type { RequestContext } from '../engine/RequestContext';

function isIpAddress(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(':');
}

function registrableDomain(value: string): string {
  const domain = value.toLowerCase().replace(/^www\./, '');
  if (!domain || domain === 'localhost' || isIpAddress(domain)) return domain;
  const labels = domain.split('.').filter(Boolean);
  return labels.length > 1 ? labels.slice(-2).join('.') : domain;
}

export function isThirdParty(sourceDomain: string, destinationDomain: string): boolean {
  return registrableDomain(sourceDomain) !== registrableDomain(destinationDomain);
}

export function matchesThirdParty(ruleValue: boolean | undefined, request: RequestContext): boolean {
  return ruleValue === undefined || ruleValue === request.isThirdParty;
}
