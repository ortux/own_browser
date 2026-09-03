import { useEffect, useState } from 'react';
import readerScript from './readerMode.js?raw';

let cached: string | null = null;

/** Returns the bundled reader-mode script, ready for executeJavaScript. */
export function getReaderScript(): string {
  if (!cached) cached = readerScript;
  return cached;
}

/** Tracks whether reader mode is currently active for the active tab. */
export function useReaderScript(): string {
  const [s] = useState(getReaderScript);
  useEffect(() => {}, []);
  return s;
}
