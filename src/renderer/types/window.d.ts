import type { BrowserAPI } from '../../preload/index';

declare global {
  interface Window {
    browserAPI: BrowserAPI;
    __PM_PRELOAD__?: string;
  }
}
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      preload?: string;
      webpreferences?: string;
      partition?: string;
      allowpopups?: boolean;
      nodeintegration?: boolean;
      nodeintegrationinsubframes?: boolean;
      ref?: React.Ref<Electron.WebviewTag>;
    };
  }
}

export {};

declare module '*.png' {
  const src: string;
  export default src;
}
