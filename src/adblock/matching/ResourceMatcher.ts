import type { FilterRule } from '../engine/FilterRule';
import type { RequestContext } from '../engine/RequestContext';

export function matchesResourceType(rule: FilterRule, request: RequestContext): boolean {
  return rule.resourceTypes.length === 0 || rule.resourceTypes.includes(request.resourceType);
}
