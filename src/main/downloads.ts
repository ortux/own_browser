/**
 * downloads.ts — Zyphora download manager
 *
 * Hooks Electron's session "will-download" event to capture downloads, saves
 * them to a configurable location (no native save dialog), tracks progress and
 * state in memory, and pushes live updates to the renderer.
 */

import { app, session, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import type { Download } from '../shared/types';

let mainWindow: Electron.BrowserWindow | null = null;
let downloadPath = '';

// In-memory store of download records + the live Electron.DownloadItem handles.
// We must keep a reference to each in-flight `item`, or Electron may
// garbage-collect it and silently cancel the download. Items are released as
// soon as the download reaches a terminal state.
const MAX_DOWNLOAD_RECORDS = 500;
const records = new Map<string, Download>();
const items = new Map<string, Electron.DownloadItem>();
const attachedSessions = new WeakSet<Electron.Session>();

function ensurePath(): string {
  if (!downloadPath) downloadPath = app.getPath('downloads');
  return downloadPath;
}

export function setMainWindow(win: Electron.BrowserWindow | null): void {
  mainWindow = win;
}

export function getDownloadPath(): string {
  return ensurePath();
}

function notify(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const list = Array.from(records.values()).sort((a, b) => b.startTime - a.startTime);
  mainWindow.webContents.send('download:updated', list);
}

function pruneCompletedRecords(): void {
  if (records.size <= MAX_DOWNLOAD_RECORDS) return;
  const removable = Array.from(records.values())
    .filter((record) => record.state !== 'progressing')
    .sort((a, b) => a.startTime - b.startTime);
  while (records.size > MAX_DOWNLOAD_RECORDS && removable.length > 0) {
    const record = removable.shift();
    if (record) records.delete(record.id);
  }
}

/**
 * Pick a destination that doesn't collide with an existing file:
 * "name.ext" → "name (1).ext" → "name (2).ext" …
 * Without this, two downloads with the same name silently overwrite each other.
 */
function uniqueSavePath(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  let candidate = path.join(dir, filename);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n++;
  }
  return candidate;
}

/** True while the download is still transferring data. */
function isActive(id: string): boolean {
  return records.get(id)?.state === 'progressing';
}

/**
 * Register the will-download handler on the default session. Must be called
 * once at startup, before any webview is created.
 */
export function attachDownloadsToSession(ses: Electron.Session): void {
  if (attachedSessions.has(ses)) return;
  attachedSessions.add(ses);

  ses.on(
    'will-download',
    (_event: Electron.Event, item: Electron.DownloadItem) => {
      // NOTE: setting the save path synchronously inside this handler is what
      // suppresses the native save dialog (Electron only shows the dialog when
      // no save path was set). Do NOT call event.preventDefault() here — per
      // the Electron docs that CANCELS the download entirely.
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Sanitize the server-provided name so it can't escape the save folder.
      const rawName = item.getFilename() || 'download';
      const filename = rawName
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 200) || 'download';
      const dir = ensurePath();
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        /* ignore — best effort; Electron will report an error on save */
      }
      const savePath = uniqueSavePath(dir, filename);
      item.setSavePath(savePath);

      const rec: Download = {
        id,
        filename: path.basename(savePath),
        url: item.getURL(),
        state: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        percent: 0,
        path: savePath,
        startTime: Date.now(),
        endTime: null,
      };
      records.set(id, rec);
      pruneCompletedRecords();
      items.set(id, item); // retain to avoid GC-triggered cancellation
      notify();
      // Let the renderer optionally pop open the Downloads page on a new download.
      mainWindow?.webContents.send('download:started', rec);

      item.on('updated', (_e: Electron.Event, state: string) => {
        const r = records.get(id);
        if (!r) return;
        r.receivedBytes = item.getReceivedBytes();
        r.totalBytes = item.getTotalBytes();
        r.percent = r.totalBytes > 0 ? Math.min(1, r.receivedBytes / r.totalBytes) : 0;
        if (state === 'interrupted') r.state = 'interrupted';
        else if (state === 'progressing') r.state = 'progressing';
        notify();
      });

      item.on('done', (_e: Electron.Event, state: string) => {
        const r = records.get(id);
        if (!r) return;
        r.receivedBytes = item.getReceivedBytes();
        r.totalBytes = item.getTotalBytes();
        r.endTime = Date.now();
        if (state === 'completed') {
          r.state = 'completed';
          // A finished download is exactly 100%, even if the server never
          // advertised a content-length.
          r.percent = 1;
        } else if (state === 'cancelled') {
          r.state = 'canceled';
          r.percent = r.totalBytes > 0 ? Math.min(1, r.receivedBytes / r.totalBytes) : 0;
        } else {
          r.state = 'interrupted';
          r.percent = r.totalBytes > 0 ? Math.min(1, r.receivedBytes / r.totalBytes) : 0;
        }
        // The download is finished — releasing our handle is now safe.
        items.delete(id);
        notify();
      });
    }
  );
}

export function initDownloads(): void {
  ensurePath();
  attachDownloadsToSession(session.defaultSession);
}

export function getDownloads(): Download[] {
  return Array.from(records.values()).sort((a, b) => b.startTime - a.startTime);
}

export function setDownloadPath(p: string): void {
  if (typeof p !== 'string' || !p.trim() || p.includes('\0') || !path.isAbsolute(p)) {
    throw new Error('Download path must be an absolute directory path.');
  }

  const resolved = path.resolve(p);
  fs.mkdirSync(resolved, { recursive: true });
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error('Download path is not a directory.');
  }
  downloadPath = resolved;
}

export function cancelDownload(id: string): void {
  items.get(id)?.cancel();
}

export function retryDownload(id: string): void {
  const record = records.get(id);
  if (!record || record.state === 'progressing') return;
  try {
    const url = new URL(record.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    session.defaultSession.downloadURL(record.url);
  } catch {
    // Ignore malformed or unsupported download URLs.
  }
}

export function removeDownload(id: string): void {
  // Cancelling first prevents an orphaned in-flight download that keeps
  // writing to disk (or dies to a GC-cancel) with no visible record.
  if (isActive(id)) items.get(id)?.cancel();
  records.delete(id);
  items.delete(id);
  notify();
}

export function clearDownloads(): void {
  for (const [id, item] of items) {
    if (isActive(id)) item.cancel();
  }
  records.clear();
  items.clear();
  notify();
}

export function openDownload(id: string): void {
  const r = records.get(id);
  if (r?.path) shell.openPath(r.path).catch(() => {});
}

export function showDownload(id: string): void {
  const r = records.get(id);
  if (r?.path) shell.showItemInFolder(r.path);
}

export function revealFolder(): void {
  shell.openPath(ensurePath()).catch(() => {});
}

export async function pickFolder(): Promise<string | null> {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
}
