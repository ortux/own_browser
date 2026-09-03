/**
 * sections.ts — the identifiers for every Settings section.
 *
 * A standalone module so the search index (plain data) and the sidebar model
 * (React icons) can share it without depending on each other.
 */

export type SectionId =
  | 'general'
  | 'appearance'
  | 'search'
  | 'tabs'
  | 'languages'
  | 'accessibility'
  | 'privacy'
  | 'security'
  | 'permissions'
  | 'passwords'
  | 'clear-data'
  | 'ai-agent'
  | 'agent-permissions'
  | 'memory'
  | 'ai-models'
  | 'downloads'
  | 'extensions'
  | 'default-browser'
  | 'sync'
  | 'performance'
  | 'startup'
  | 'updates'
  | 'about';
