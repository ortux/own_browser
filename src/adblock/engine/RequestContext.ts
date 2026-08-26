export type ResourceType =
  | 'main_frame'
  | 'sub_frame'
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'font'
  | 'media'
  | 'websocket'
  | 'xhr'
  | 'fetch'
  | 'other';

export interface RequestContext {
  url: string;
  sourceUrl: string;
  sourceDomain: string;
  destinationDomain: string;
  resourceType: ResourceType;
  method?: string;
  isThirdParty: boolean;
  isMainFrame: boolean;
  tabId?: string;
}
