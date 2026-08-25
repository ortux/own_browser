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
// We must keep references to BOTH the will-download `event` and the `item`, or
// Electron may garbage-collect them and silently cancel the download.
const records = new Map<string, Download>();
const items = new Map<string, Electron.DownloadItem>();
const events = new Map<string, Electron.Event>();

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
  const list = Array.from(records.values()).sort((a, b) => b.startTime - a.startTime);
  mainWindow?.webContents.send('download:updated', list);
}

/**
 * Register the will-download handler on the default session. Must be called
 * once at startup, before any webview is created.
 */
export function initDownloads(): void {
  ensurePath();

  session.defaultSession.on(
    'will-download',
    (event: Electron.Event, item: Electron.DownloadItem) => {
      // We manage the save path ourselves — suppress the native dialog.
      event.preventDefault();

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
      const savePath = path.join(dir, filename);
      item.savePath = savePath;

      const rec: Download = {
        id,
        filename,
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
      items.set(id, item);
      events.set(id, event); // retain to avoid GC-triggered cancellation
      notify();
      // Let the renderer optionally pop open the Downloads page on a new download.
      mainWindow?.webContents.send('download:started', rec);

      item.on('updated', (_e: Electron.Event, state: string) => {
        const r = records.get(id);
        if (!r) return;
        r.receivedBytes = item.getReceivedBytes();
        r.totalBytes = item.getTotalBytes();
        r.percent = r.totalBytes > 0 ? r.receivedBytes / r.totalBytes : 0;
        if (state === 'interrupted') r.state = 'interrupted';
        else if (state === 'progressing' && item.isPaused()) r.state = 'progressing';
        notify();
      });

      item.on('done', (_e: Electron.Event, state: string) => {
        const r = records.get(id);
        if (!r) return;
        r.receivedBytes = item.getReceivedBytes();
        r.totalBytes = item.getTotalBytes();
        r.percent = r.totalBytes > 0 ? r.receivedBytes / r.totalBytes : 1;
        r.endTime = Date.now();
        if (state === 'completed') r.state = 'completed';
        else if (state === 'cancelled') r.state = 'canceled';
        else r.state = 'interrupted';
        events.delete(id);
        notify();
      });
    }
  );
}

export function getDownloads(): Download[] {
  return Array.from(records.values()).sort((a, b) => b.startTime - a.startTime);
}

export function setDownloadPath(p: string): void {
  if (p && typeof p === 'string') downloadPath = p;
}

export function cancelDownload(id: string): void {
  items.get(id)?.cancel();
}

export function removeDownload(id: string): void {
  records.delete(id);
  items.delete(id);
  events.delete(id);
  notify();
}

export function clearDownloads(): void {
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
