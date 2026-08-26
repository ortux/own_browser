import type { FilterRule } from '../engine/FilterRule';
import type { RequestContext } from '../engine/RequestContext';

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
}

export function matchesUrl(rule: FilterRule, request: RequestContext): boolean {
  if (rule.domainPattern) {
    const domain = request.destinationDomain.toLowerCase();
    return domain === rule.pattern || domain.endsWith(`.${rule.pattern}`);
  }
  rule.urlMatcher ??= new RegExp(rule.regexSource ?? wildcardToRegExp(rule.pattern).source, 'i');
  return rule.urlMatcher.test(request.url);
}
