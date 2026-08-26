import type { FilterRule } from '../engine/FilterRule';
import type { RequestContext } from '../engine/RequestContext';

function escapeRegExpCharacter(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert an ABP-style wildcard pattern into a safe regular expression. */
function wildcardToRegExp(pattern: string): string {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === '*') {
      source += '.*';
    } else if (character === '^') {
      // ABP's separator matches a non-letter/digit separator or end-of-URL.
      source += '(?:[^a-zA-Z0-9_.%\\-]|$)';
    } else if (character === '|' && index === 0) {
      source += '^';
    } else if (character === '|' && index === pattern.length - 1) {
      source += '$';
    } else {
      source += escapeRegExpCharacter(character);
    }
  }
  return source;
}

export function matchesUrl(rule: FilterRule, request: RequestContext): boolean {
  if (rule.domainPattern) {
    const domain = request.destinationDomain.toLowerCase();
    return domain === rule.pattern || domain.endsWith(`.${rule.pattern}`);
  }
  rule.urlMatcher ??= new RegExp(
    rule.regexSource ?? wildcardToRegExp(rule.pattern),
    rule.regexFlags ?? 'i'
  );
  return rule.urlMatcher.test(request.url);
}
