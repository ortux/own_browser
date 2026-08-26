import { getDomain } from 'tldts';
import type { RequestContext } from '../engine/RequestContext';

function registrableDomain(value: string): string {
  const normalized = value.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!normalized) return '';
  // tldts ships the public suffix list and correctly handles co.uk, co.in,
  // private suffixes, IDNs, and other cases a last-two-label heuristic misses.
  return getDomain(normalized, { allowPrivateDomains: true }) ?? normalized;
}

export function isThirdParty(sourceDomain: string, destinationDomain: string): boolean {
  return registrableDomain(sourceDomain) !== registrableDomain(destinationDomain);
}

export function matchesThirdParty(ruleValue: boolean | undefined, request: RequestContext): boolean {
  return ruleValue === undefined || ruleValue === request.isThirdParty;
}
