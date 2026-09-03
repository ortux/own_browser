/**
 * logger.ts — development-only diagnostics.
 *
 * The sync, token and offline-queue modules narrate every step they take.
 * That is useful while developing and pure noise in a shipped browser, where
 * it also leaks account and device details into the console of any DevTools
 * window the user opens. `import.meta.env.DEV` is statically replaced by Vite,
 * so these calls are dropped from the production bundle entirely.
 */

const enabled = import.meta.env.DEV;

export const log = {
  debug: (...args: unknown[]): void => {
    if (enabled) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (enabled) console.log(...args);
  },
  /** Warnings and errors are always kept: they report real failures. */
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
