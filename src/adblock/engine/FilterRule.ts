import type { ResourceType } from './RequestContext';

export interface FilterRule {
  raw: string;
  pattern: string;
  exception: boolean;
  important: boolean;
  domainPattern: boolean;
  domains: string[];
  excludedDomains: string[];
  resourceTypes: ResourceType[];
  thirdParty?: boolean;
  firstParty?: boolean;
  tokens: string[];
  regexSource?: string;
  urlMatcher?: RegExp;
}
