/**
 * First-run tour step definitions.
 *
 * Each step targets a real DOM element via a `data-tour` attribute selector.
 * The FirstRunTour component resolves these to live pixel rects via
 * getBoundingClientRect, so the highlight box always tracks the actual element
 * regardless of window size or layout configuration.
 */

export type FirstRunTourStep = {
  /** Unique identifier for the step. */
  id: string;
  /** Heading shown in the tour card. */
  title: string;
  /** Body text shown in the tour card. */
  description: string;
  /** Short action hint shown in the pointer row. */
  pointerText: string;
  /**
   * CSS attribute selector for the element to highlight.
   * Must match exactly one element that is in the DOM when the tour renders.
   * Convention: use `[data-tour="<value>"]`.
   */
  selector: string;
  /**
   * Optional padding (px) added around the matched element's bounding rect.
   * Defaults to 6.
   */
  padding?: number;
  /**
   * Where to anchor the info card relative to the highlighted element.
   * - 'auto'   → the component picks the side with the most space (default)
   * - 'top'    → card appears above the element
   * - 'bottom' → card appears below the element
   * - 'left'   → card appears to the left
   * - 'right'  → card appears to the right
   */
  cardPlacement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
};

export const FIRST_RUN_TOUR_STEPS: FirstRunTourStep[] = [
  {
    id: 'address-bar',
    title: 'Address bar',
    description:
      'Type any URL or search query here. Press Enter to navigate — the browser will search for you if it looks like a query.',
    pointerText: 'Start here to visit a site or search the web.',
    selector: '[data-tour="address-bar"]',
    padding: 4,
    cardPlacement: 'top',
  },
  {
    id: 'adblock-shield',
    title: 'Privacy & ad blocker',
    description:
      'This shield toggles the built-in tracker and ad blocker. When lit up, it is actively protecting your browsing session.',
    pointerText: 'Click to toggle tracker blocking for the current session.',
    selector: '[data-tour="adblock-shield"]',
    padding: 6,
    cardPlacement: 'top',
  },
  {
    id: 'sidebar-tabs',
    title: 'Tab sidebar',
    description:
      'Your open tabs live here. Hover to expand the panel and see full page titles. Drag tabs to reorder them.',
    pointerText: 'Hover the sidebar to expand it and manage your tabs.',
    selector: '[data-tour="sidebar-tabs"]',
    padding: 0,
    cardPlacement: 'right',
  },
  {
    id: 'settings-btn',
    title: 'Settings',
    description:
      'Open settings to customise the browser — change search engine, proxy, downloads, privacy controls, and more.',
    pointerText: 'Use settings to fine-tune the browser for your workflow.',
    selector: '[data-tour="settings-btn"]',
    padding: 4,
    cardPlacement: 'right',
  },
  {
    id: 'content-area',
    title: 'Page content area',
    description:
      'Web pages load here. The new-tab page gives you quick access to bookmarks and recently visited sites.',
    pointerText: 'This is your main browsing canvas.',
    selector: '[data-tour="content-area"]',
    padding: 0,
    cardPlacement: 'auto',
  },
];
