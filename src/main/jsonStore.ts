/**
 * jsonStore.ts — small, crash-safe JSON files in userData.
 *
 * Several pieces of state (open tabs, window geometry, per-site zoom) are
 * recoverable preferences rather than user data: if a file is unreadable the
 * right response is to fall back to a default, not to surface an error. They
 * also do not belong in the sql.js database, which rewrites itself in full on
 * every write.
 *
 * Writes go to a temp file and are then renamed, which is atomic on the same
 * filesystem, so a crash mid-write cannot leave a half-written file behind.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export function userDataPath(filename: string): string {
  return path.join(app.getPath('userData'), filename);
}

/** Write `value` as JSON. Never throws; failures are logged and swallowed. */
export function writeJsonFile(filename: string, value: unknown): void {
  const target = userDataPath(filename);
  const temp = `${target}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value));
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* best effort */
    }
    console.error(`[store] could not write ${filename}:`, error);
  }
}

/**
 * Read and JSON-parse a file. Returns null when it is missing, unreadable, or
 * not valid JSON — callers are expected to treat that as "use the default".
 */
export function readJsonFile(filename: string): unknown {
  const target = userDataPath(filename);
  try {
    if (!fs.existsSync(target)) return null;
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    console.error(`[store] could not read ${filename}; ignoring:`, error);
    return null;
  }
}

export function removeJsonFile(filename: string): void {
  try {
    fs.rmSync(userDataPath(filename), { force: true });
  } catch (error) {
    console.error(`[store] could not remove ${filename}:`, error);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Coalesces bursts of writes onto a single timer.
 *
 * Zoom changes and window drags both fire far faster than they need to be
 * persisted; without this every mouse move during a resize would hit the disk.
 */
export class DebouncedWriter<T> {
  private timer: NodeJS.Timeout | null = null;
  private pending: T | null = null;

  constructor(
    private readonly filename: string,
    private readonly delayMs: number
  ) {}

  schedule(value: T, delayMs = this.delayMs): void {
    this.pending = value;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.commit();
    }, delayMs);
  }

  /** Write any queued value immediately. Used on quit. */
  flush(value?: T): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (value !== undefined) this.pending = value;
    this.commit();
  }

  /** Drop anything queued without writing it. */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  private commit(): void {
    if (this.pending === null) return;
    writeJsonFile(this.filename, this.pending);
    this.pending = null;
  }
}
