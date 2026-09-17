export type TourTarget = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type FirstRunTourStep = {
  id: string;
  title: string;
  description: string;
  pointerText: string;
  target: TourTarget;
};

export const FIRST_RUN_TOUR_STEPS: FirstRunTourStep[] = [
  {
    id: 'nav-bar',
    title: 'Address bar',
    description: 'Type any website here. This is your main entry point for browsing, search, and quick navigation.',
    pointerText: 'Start here to visit a site or search the web.',
    target: { x: 220, y: 34, width: 420, height: 42 },
  },
  {
    id: 'tabs',
    title: 'Tabs',
    description: 'Open multiple tabs and switch between them quickly. Each tab behaves like a separate browser context.',
    pointerText: 'Use tabs to keep multiple pages open at once.',
    target: { x: 80, y: 18, width: 120, height: 36 },
  },
  {
    id: 'security',
    title: 'Privacy & security',
    description: 'This shield toggles tracker blocking and security protections that help keep browsing private.',
    pointerText: 'Click here to enable tracker blocking and privacy tools.',
    target: { x: 700, y: 18, width: 42, height: 42 },
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Open the settings panel to customize the browser, proxy, downloads, and privacy controls.',
    pointerText: 'Use settings to fine-tune the browser for your workflow.',
    target: { x: 780, y: 18, width: 42, height: 42 },
  },
  {
    id: 'new-tab',
    title: 'New tab page',
    description: 'Your start page is designed for fast access. You can search, open bookmarks, and return to recent pages here.',
    pointerText: 'This area is your home base for quick browsing.',
    target: { x: 420, y: 120, width: 320, height: 180 },
  },
];
