import type { FilterRule } from './FilterRule';

export type FilterAction = 'ALLOW' | 'BLOCK' | 'REDIRECT';

export interface FilterResult {
  action: FilterAction;
  rule?: FilterRule;
  listName?: string;
  reason?: string;
  redirectResource?: string;
}
