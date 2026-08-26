import type { FilterRule } from '../engine/FilterRule';
import type { RequestContext } from '../engine/RequestContext';

function matchesDomain(domain: string, candidate: string): boolean {
  return candidate === domain || candidate.endsWith(`.${domain}`);
}

export function matchesDomains(rule: FilterRule, request: RequestContext): boolean {
  if (!rule.domainPattern) return true;
  const source = request.sourceDomain.toLowerCase();
  const included = rule.domains.length === 0 || rule.domains.some((domain) => matchesDomain(domain, source));
  const excluded = rule.excludedDomains.some((domain) => matchesDomain(domain, source));
  return included && !excluded;
}
