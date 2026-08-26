import type { FilterResult } from './FilterResult';
import type { FilterRule } from './FilterRule';
import type { RequestContext } from './RequestContext';
import { matchesDomains } from '../matching/DomainMatcher';
import { matchesResourceType } from '../matching/ResourceMatcher';
import { matchesThirdParty } from '../matching/ThirdPartyMatcher';
import { matchesUrl } from '../matching/UrlMatcher';

export class AdBlockEngine {
  private readonly rulesByToken = new Map<string, FilterRule[]>();
  private readonly domainRulesBySuffix = new Map<string, FilterRule[]>();
  private readonly fallbackRules: FilterRule[] = [];
  private readonly allowlistedDomains = new Set<string>();
  private enabled = true;

  addRules(rules: Iterable<FilterRule>): void {
    for (const rule of rules) {
      if (rule.domainPattern) {
        const rulesForDomain = this.domainRulesBySuffix.get(rule.pattern) ?? [];
        rulesForDomain.push(rule);
        this.domainRulesBySuffix.set(rule.pattern, rulesForDomain);
      } else {
        if (rule.tokens.length === 0) {
          this.fallbackRules.push(rule);
        } else {
          for (const token of rule.tokens) {
            const rulesForToken = this.rulesByToken.get(token) ?? [];
            rulesForToken.push(rule);
            this.rulesByToken.set(token, rulesForToken);
          }
        }
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  addAllowlist(domain: string): void {
    this.allowlistedDomains.add(domain.toLowerCase().replace(/^www\./, ''));
  }

  removeAllowlist(domain: string): void {
    this.allowlistedDomains.delete(domain.toLowerCase().replace(/^www\./, ''));
  }

  checkRequest(request: RequestContext): FilterResult {
    if (!this.enabled || this.isAllowlisted(request.sourceDomain)) {
      return { action: 'ALLOW', reason: 'disabled-or-allowlisted' };
    }

    const candidates = this.candidates(request);
    const exceptions = candidates.filter((rule) => rule.exception && this.matches(rule, request));
    const blocks = candidates.filter((rule) => !rule.exception && this.matches(rule, request));
    const important = blocks.find((rule) => rule.important);
    const selected = important ?? blocks[0];

    if (!selected || (!important && exceptions.length > 0)) {
      return { action: 'ALLOW', reason: exceptions.length > 0 ? 'exception-rule' : 'no-match' };
    }
    return { action: 'BLOCK', rule: selected, reason: 'filter-rule' };
  }

  private candidates(request: RequestContext): FilterRule[] {
    const candidates: FilterRule[] = [];
    const labels = request.destinationDomain.toLowerCase().split('.');
    for (let index = 0; index < labels.length; index++) {
      const suffix = labels.slice(index).join('.');
      const rules = this.domainRulesBySuffix.get(suffix);
      if (rules) candidates.push(...rules);
    }
    const urlTokens = request.url.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    const seen = new Set<FilterRule>();
    for (const token of urlTokens) {
      const rules = this.rulesByToken.get(token);
      if (rules) for (const rule of rules) seen.add(rule);
    }
    return candidates.concat(this.fallbackRules, [...seen]);
  }

  private matches(rule: FilterRule, request: RequestContext): boolean {
    return matchesUrl(rule, request)
      && matchesDomains(rule, request)
      && matchesResourceType(rule, request)
      && matchesThirdParty(rule.thirdParty, request)
      && (rule.firstParty === undefined || rule.firstParty === !request.isThirdParty);
  }

  private isAllowlisted(domain: string): boolean {
    const value = domain.toLowerCase().replace(/^www\./, '');
    for (const allowed of this.allowlistedDomains) {
      if (value === allowed || value.endsWith(`.${allowed}`)) return true;
    }
    return false;
  }
}
