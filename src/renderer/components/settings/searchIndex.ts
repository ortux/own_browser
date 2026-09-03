/**
 * searchIndex.ts — every searchable setting, and the ranking that finds it.
 *
 * Deliberately free of React and icon imports so it stays a plain data module
 * that can be unit-tested and reused anywhere.
 */

import type { SectionId } from './sections';

export interface SearchEntry {
  /** Which sidebar section shows this setting. */
  section: SectionId;
  /** Element id to scroll to and highlight once the section is open. */
  anchor?: string;
  title: string;
  description: string;
  /** Extra words that should match but are not worth showing. */
  keywords?: string;
}

/**
 * Every searchable setting, with the words a user would actually type.
 * Kept next to the nav model so a new section cannot be added without
 * deciding how it is found.
 */
export const SEARCH_INDEX: SearchEntry[] = [
  // Startup
  {
    section: 'general',
    anchor: 'startup',
    title: 'On startup',
    description: 'Choose what happens when the browser starts.',
    keywords: 'launch open new tab continue where you left off specific pages session',
  },
  {
    section: 'general',
    anchor: 'startup',
    title: 'Launch browser at system startup',
    description: 'Open Zyphora automatically when you sign in to this computer.',
    keywords: 'login autostart boot',
  },
  {
    section: 'general',
    anchor: 'startup',
    title: 'Restore previous session',
    description: 'Reopen the tabs you had open when you last closed Zyphora.',
    keywords: 'continue tabs session restore',
  },
  // Search
  {
    section: 'general',
    anchor: 'search',
    title: 'Default search engine',
    description: 'Used for searches typed in the address bar.',
    keywords: 'google bing duckduckgo brave ecosia',
  },
  {
    section: 'general',
    anchor: 'search',
    title: 'Search suggestions',
    description: 'Get helpful suggestions while typing in the address bar.',
    keywords: 'autocomplete omnibox',
  },
  {
    section: 'general',
    anchor: 'search',
    title: 'Show search history suggestions',
    description: 'Suggest pages you have visited before as you type.',
    keywords: 'history omnibox',
  },
  {
    section: 'general',
    anchor: 'search',
    title: 'Show bookmark suggestions',
    description: 'Suggest your bookmarks as you type in the address bar.',
    keywords: 'bookmarks favourites',
  },
  {
    section: 'general',
    anchor: 'search',
    title: 'Search from address bar',
    description: 'Treat text that is not a web address as a search.',
    keywords: 'omnibox url bar',
  },
  {
    section: 'general',
    anchor: 'search',
    title: 'Open search results in a new tab',
    description: 'Keep the current page and open searches beside it.',
  },
  {
    section: 'search',
    title: 'Manage search engines',
    description: 'Add, choose, or remove the engines available for searching.',
    keywords: 'custom engine keyword shortcut',
  },
  // Navigation
  {
    section: 'general',
    anchor: 'navigation',
    title: 'Open external links in a new tab',
    description: 'Links opened from other applications land in a new tab.',
  },
  {
    section: 'general',
    anchor: 'navigation',
    title: 'Open external links in a new window',
    description: 'Links opened from other applications get their own window.',
  },
  {
    section: 'general',
    anchor: 'navigation',
    title: 'Show full URL in address bar',
    description: 'Show the complete address instead of just the domain.',
    keywords: 'url https scheme',
  },
  {
    section: 'general',
    anchor: 'navigation',
    title: 'Enable smooth scrolling',
    description: 'Animate scrolling instead of jumping line by line.',
  },
  {
    section: 'general',
    anchor: 'navigation',
    title: 'Show loading indicator',
    description: 'Show progress in the tab while a page is loading.',
  },
  // Tabs
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Open new tabs next to the current tab',
    description: 'New tabs appear beside the tab you opened them from.',
    keywords: 'tab behavior order',
  },
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Switch to a new tab immediately',
    description: 'Focus a new tab as soon as it opens.',
    keywords: 'tab behavior new tab',
  },
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Show tab previews',
    description: 'Show the page title and address when hovering a tab.',
    keywords: 'tab previews hover tooltip',
  },
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Warn before closing multiple tabs',
    description: 'Ask for confirmation before closing a window with several tabs.',
    keywords: 'tab close confirm',
  },
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Reopen closed tabs',
    description: 'Keep recently closed tabs available with Ctrl+Shift+T.',
    keywords: 'tab undo restore',
  },
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Keep browser open when the last tab is closed',
    description: 'Show an empty new tab instead of quitting.',
    keywords: 'tab quit exit',
  },
  {
    section: 'general',
    anchor: 'tabs',
    title: 'Automatically discard inactive tabs',
    description: 'Free the memory used by background tabs you have not looked at.',
    keywords: 'tab sleep memory discard performance',
  },
  // Home button
  {
    section: 'general',
    anchor: 'home',
    title: 'Show Home button on toolbar',
    description: 'Add a Home button next to the address bar.',
    keywords: 'homepage toolbar',
  },
  {
    section: 'general',
    anchor: 'home',
    title: 'Homepage',
    description: 'Where the Home button takes you.',
    keywords: 'home custom url new tab',
  },
  // Downloads
  {
    section: 'general',
    anchor: 'downloads',
    title: 'Download location',
    description: 'Where downloaded files are saved.',
    keywords: 'download folder directory save path change',
  },
  {
    section: 'general',
    anchor: 'downloads',
    title: 'Ask where to save each file',
    description: 'Show a save dialog for every download.',
    keywords: 'download save dialog prompt',
  },
  {
    section: 'general',
    anchor: 'downloads',
    title: 'Show download notifications',
    description: 'Notify me when a download finishes.',
    keywords: 'download notification alert',
  },
  {
    section: 'general',
    anchor: 'downloads',
    title: 'Automatically open downloaded files',
    description: 'Open files as soon as they finish downloading.',
    keywords: 'download open automatically',
  },
  {
    section: 'general',
    anchor: 'downloads',
    title: 'Clear completed downloads from the download panel',
    description: 'Remove finished downloads from the list. Files are kept.',
    keywords: 'download clear panel list',
  },
  // Appearance
  {
    section: 'general',
    anchor: 'appearance',
    title: 'Theme',
    description: 'Light, dark, or follow the system setting.',
    keywords: 'appearance dark light system colour color',
  },
  {
    section: 'general',
    anchor: 'appearance',
    title: 'Show bookmarks bar',
    description: 'Keep your bookmarks visible under the address bar.',
  },
  {
    section: 'general',
    anchor: 'appearance',
    title: 'Show sidebar',
    description: 'Show the tab sidebar along the left edge.',
  },
  {
    section: 'general',
    anchor: 'appearance',
    title: 'Use compact toolbar',
    description: 'Reduce the height of the browser toolbar.',
  },
  {
    section: 'general',
    anchor: 'appearance',
    title: 'Show tab search button',
    description: 'Add a button that searches your open tabs.',
  },
  // Language
  {
    section: 'general',
    anchor: 'language',
    title: 'Browser language',
    description: 'The language Zyphora asks websites for.',
    keywords: 'language english bengali hindi locale',
  },
  {
    section: 'general',
    anchor: 'language',
    title: 'Offer to translate pages',
    description: 'Ask whether to translate pages in other languages.',
    keywords: 'translate translation',
  },
  {
    section: 'general',
    anchor: 'language',
    title: 'Never translate these languages',
    description: 'Languages you always read in the original.',
    keywords: 'translate exception',
  },
  {
    section: 'general',
    anchor: 'language',
    title: 'Region, date, time and number format',
    description: 'How dates, times and numbers are shown in the browser.',
    keywords: 'region locale date time number format 24 hour',
  },
  // Accessibility
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Default font size',
    description: 'The size of text on pages that do not specify one.',
    keywords: 'accessibility font text size',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Minimum font size',
    description: 'Never render page text smaller than this.',
    keywords: 'accessibility font text size minimum',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Default page zoom',
    description: 'The zoom level applied to pages you have not zoomed yourself.',
    keywords: 'zoom scale accessibility',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'High contrast mode',
    description: 'Increase contrast throughout the browser interface.',
    keywords: 'accessibility contrast vision',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Reduce animations',
    description: 'Minimise motion in the browser interface.',
    keywords: 'accessibility motion animation',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Always show focus indicator',
    description: 'Keep the keyboard focus ring visible even when using a mouse.',
    keywords: 'accessibility keyboard focus',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Enable keyboard navigation',
    description: 'Move through the interface and pages using the keyboard.',
    keywords: 'accessibility keyboard tab',
  },
  {
    section: 'general',
    anchor: 'accessibility',
    title: 'Caret browsing',
    description: 'Navigate page text with a movable cursor.',
    keywords: 'accessibility caret cursor f7',
  },
  // Default browser & reset
  {
    section: 'general',
    anchor: 'default-browser',
    title: 'Default browser',
    description: 'Make Zyphora the browser your computer opens links with.',
    keywords: 'default browser make default system',
  },
  {
    section: 'general',
    anchor: 'reset',
    title: 'Reset settings',
    description: 'Restore browser settings to their original defaults.',
    keywords: 'reset defaults restore',
  },
  {
    section: 'general',
    anchor: 'reset',
    title: 'Clear browsing data',
    description: 'Remove local history, cookies, cache, and site storage.',
    keywords: 'clear delete history cookies cache',
  },
  // Other sections
  {
    section: 'security',
    title: 'Block trackers & ads',
    description: 'Prevent known trackers from following you across sites.',
    keywords: 'privacy adblock tracking',
  },
  {
    section: 'security',
    title: 'Force HTTPS',
    description: 'Upgrade insecure http:// connections to https://.',
  },
  {
    section: 'privacy',
    title: 'Remove tracking parameters',
    description: 'Strip utm_, gclid and similar tags from addresses.',
    keywords: 'privacy tracking utm',
  },
  {
    section: 'privacy',
    title: 'Strict private DNS',
    description: 'Resolve every name through encrypted DNS-over-HTTPS.',
    keywords: 'dns doh privacy',
  },
  {
    section: 'privacy',
    title: 'History retention',
    description: 'How long browsing history is kept before it is pruned.',
    keywords: 'history retention delete',
  },
  {
    section: 'permissions',
    title: 'Site permissions',
    description: 'Camera, microphone, location and notification decisions per site.',
    keywords: 'permissions camera microphone location notifications',
  },
  {
    section: 'passwords',
    title: 'Password manager',
    description: 'Offer to save logins and fill them back in.',
    keywords: 'passwords logins autofill',
  },
  {
    section: 'clear-data',
    title: 'Clear browsing data',
    description: 'Remove local history, cookies, cache, and site storage.',
    keywords: 'clear delete cookies cache history',
  },
  {
    section: 'performance',
    title: 'Sleep idle tabs',
    description: 'Free the memory used by background tabs.',
    keywords: 'performance memory tabs sleep discard',
  },
  {
    section: 'sync',
    title: 'Account & sync',
    description: 'Sign in to sync bookmarks and history across your devices.',
    keywords: 'sync account sign in devices',
  },
  {
    section: 'downloads',
    title: 'Download folder',
    description: 'Where downloaded files are saved on this device.',
    keywords: 'downloads folder location',
  },
  {
    section: 'about',
    title: 'About Zyphora',
    description: 'Version and engine information.',
    keywords: 'about version electron chromium',
  },
  {
    section: 'updates',
    title: 'Updates',
    description: 'Check whether a newer version of Zyphora is available.',
    keywords: 'update version upgrade',
  },
  {
    section: 'extensions',
    title: 'Extensions',
    description: 'Browser extensions and add-ons.',
  },
  {
    section: 'ai-agent',
    title: 'AI Agent',
    description: 'Autonomy, tools and behaviour of the built-in agent.',
    keywords: 'ai agent assistant',
  },
];

/** Rank matches: title hits first, then description, then keywords. */
export function searchSettings(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/);

  const scored = SEARCH_INDEX.map((entry) => {
    const title = entry.title.toLowerCase();
    const description = entry.description.toLowerCase();
    const keywords = (entry.keywords ?? '').toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.startsWith(term)) score += 6;
      else if (title.includes(term)) score += 4;
      else if (description.includes(term)) score += 2;
      else if (keywords.includes(term)) score += 1;
      else return { entry, score: -1 };
    }
    return { entry, score };
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 12).map((row) => row.entry);
}
