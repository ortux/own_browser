/**
 * readerScript.ts — the reading-mode script, owned by the main process.
 *
 * This used to be shipped from the renderer: the shell read the script out of
 * its own bundle and passed the source over IPC for main to run with
 * `executeJavaScript`. That made the IPC channel a general-purpose
 * code-execution sink into any guest page, which is not a primitive worth
 * keeping once a scriptable agent exists.
 *
 * Bundling it here instead means the only script main will ever inject for
 * reading mode is this one, fixed at build time.
 */

import readerSource from './injected/readerMode.js?raw';

export function getReaderScript(): string {
  return readerSource;
}
