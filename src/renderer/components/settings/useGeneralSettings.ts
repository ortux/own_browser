/**
 * useGeneralSettings.ts — the bridge between the persisted General settings
 * and the parts of the browser that must react to them.
 *
 * Split into two hooks:
 *   • useApplyGeneralSettings — mounted once by BrowserWindow. Pushes the
 *     Chromium/OS-owned subset to the main process and applies the
 *     renderer-owned accessibility flags to the shell document.
 *   • useDefaultBrowser — reads the real OS default-browser state.
 *
 * Neither hook holds state of its own: the store remains the only copy.
 */

import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { toMainSettings } from '../../../shared/generalSettings';

/**
 * Applies General settings that affect the whole application.
 *
 * Mount exactly once, near the root — mounting it twice would push the same
 * values twice, which is harmless but pointless.
 */
export function useApplyGeneralSettings(): void {
  const general = useSettingsStore((s) => s.general);

  // Chromium/OS-owned subset → main process.
  React.useEffect(() => {
    void window.browserAPI?.general?.apply(toMainSettings(general)).catch(() => {});
  }, [general]);

  // Renderer-owned accessibility flags → the shell document, so the browser
  // chrome itself honours them (page content is handled by Chromium above).
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('high-contrast', general.highContrast);
    root.classList.toggle('reduce-animations', general.reduceAnimations);
    root.classList.toggle('always-focus', general.alwaysShowFocus);
    root.lang = general.browserLanguage;
  }, [
    general.highContrast,
    general.reduceAnimations,
    general.alwaysShowFocus,
    general.browserLanguage,
  ]);

  /**
   * "Enable keyboard navigation" off removes browser-chrome controls from the
   * tab order. Text fields are deliberately left reachable: taking those away
   * would strand a keyboard user in the address bar with no way out.
   */
  React.useEffect(() => {
    const root = document.documentElement;
    if (general.keyboardNavigation) {
      root.removeAttribute('data-no-keyboard-nav');
      for (const element of document.querySelectorAll('[data-kbd-nav-off]')) {
        element.removeAttribute('tabindex');
        element.removeAttribute('data-kbd-nav-off');
      }
      return;
    }

    root.setAttribute('data-no-keyboard-nav', 'true');
    const apply = () => {
      for (const element of document.querySelectorAll<HTMLElement>(
        'button:not([data-kbd-nav-off]), [role="switch"]:not([data-kbd-nav-off])'
      )) {
        element.setAttribute('data-kbd-nav-off', 'true');
        element.tabIndex = -1;
      }
    };
    apply();
    // The chrome re-renders constantly, so newly mounted controls need the
    // same treatment.
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [general.keyboardNavigation]);
}

export interface DefaultBrowserState {
  isDefault: boolean;
  checking: boolean;
  statusMessage: string;
  makeDefault: () => void;
}

/**
 * Real default-browser state, read from the operating system.
 *
 * Never optimistic: after asking the OS to make us default we re-read the
 * answer, so a platform that silently refuses (common on Linux desktops
 * without a registered .desktop file) shows an honest message instead of a
 * green tick.
 */
export function useDefaultBrowser(): DefaultBrowserState {
  const [isDefault, setIsDefault] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [statusMessage, setStatusMessage] = React.useState('');

  const refresh = React.useCallback(async () => {
    try {
      const result = await window.browserAPI.general.isDefaultBrowser();
      setIsDefault(result);
    } catch {
      setIsDefault(false);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const makeDefault = React.useCallback(() => {
    setChecking(true);
    setStatusMessage('');
    void window.browserAPI.general
      .makeDefaultBrowser()
      .then((result) => {
        setIsDefault(result);
        if (!result) {
          setStatusMessage(
            'Your system did not accept the change. Set Zyphora as the default browser in your operating system settings.'
          );
        }
      })
      .catch(() => {
        setStatusMessage('Could not contact the operating system to change the default browser.');
      })
      .finally(() => setChecking(false));
  }, []);

  return { isDefault, checking, statusMessage, makeDefault };
}
