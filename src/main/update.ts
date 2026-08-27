/**
 * update.ts — auto-update support via electron-updater (GitHub Releases).
 *
 * Update checks are strictly user-initiated (Settings → About → "Check for
 * updates") plus one silent check shortly after launch. No telemetry is
 * collected; electron-updater only talks to the configured GitHub repository.
 *
 * The dependency is loaded through createRequire so a missing/broken install
 * degrades to "updates unavailable" instead of crashing the browser.
 */
import { app, ipcMain, type BrowserWindow } from 'electron';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);

export type UpdateState =
  | 'unsupported'    // dev run, missing dependency, or no publish config
  | 'idle'
  | 'checking'
  | 'uptodate'
  | 'available'
  | 'downloading'
  | 'ready'          // downloaded, will install on quit
  | 'error';

export interface UpdateStatus {
  supported: boolean;
  state: UpdateState;
  version?: string;
  error?: string;
  progress?: number; // 0..1 while downloading
}

interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

let autoUpdater: AutoUpdaterLike | null = null;
let status: UpdateStatus = { supported: false, state: 'unsupported' };
let getWindow: () => BrowserWindow | null = () => null;

function push(): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status);
}

function setState(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next };
  push();
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!autoUpdater) {
    return { supported: false, state: 'unsupported', error: 'Updates are available in packaged builds only.' };
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setState({ state: 'error', error: error instanceof Error ? error.message : String(error) });
  }
  return status;
}

export function quitAndInstallUpdate(): void {
  if (autoUpdater && status.state === 'ready') autoUpdater.quitAndInstall();
}

/**
 * Initialise the updater and register its IPC handlers. `isTrustedMainFrame`
 * is the same sender check used by every other privileged handler.
 */
export function initAutoUpdate(
  windowGetter: () => BrowserWindow | null,
  isTrustedMainFrame: (event: Electron.IpcMainInvokeEvent) => boolean,
): void {
  getWindow = windowGetter;

  if (!app.isPackaged) {
    status = { supported: false, state: 'unsupported', error: 'Dev build — updates apply to packaged installs.' };
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = requireCjs('electron-updater') as { autoUpdater: AutoUpdaterLike };
      autoUpdater = mod.autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      status = { supported: true, state: 'idle' };

      autoUpdater.on('checking-for-update', () => setState({ state: 'checking', error: undefined }));
      autoUpdater.on('update-available', (info: unknown) => {
        const version = (info as { version?: string } | undefined)?.version;
        setState({ state: 'available', version });
      });
      autoUpdater.on('update-not-available', () => setState({ state: 'uptodate' }));
      autoUpdater.on('download-progress', (progress: unknown) => {
        const percent = (progress as { percent?: number } | undefined)?.percent;
        setState({
          state: 'downloading',
          progress: typeof percent === 'number' ? Math.min(1, Math.max(0, percent / 100)) : undefined,
        });
      });
      autoUpdater.on('update-downloaded', (info: unknown) => {
        const version = (info as { version?: string } | undefined)?.version;
        setState({ state: 'ready', version, progress: 1 });
      });
      autoUpdater.on('error', (error: unknown) => {
        setState({ state: 'error', error: error instanceof Error ? error.message : String(error) });
      });

      // One quiet check a minute after launch; everything else is user-driven.
      setTimeout(() => { void checkForUpdates(); }, 60_000);
    } catch (error) {
      status = {
        supported: false,
        state: 'unsupported',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  ipcMain.handle('update:check', (event) => {
    if (!isTrustedMainFrame(event)) throw new Error('Unauthorized IPC sender.');
    return checkForUpdates();
  });
  ipcMain.handle('update:status', (event) => {
    if (!isTrustedMainFrame(event)) throw new Error('Unauthorized IPC sender.');
    return getUpdateStatus();
  });
  ipcMain.handle('update:quit-install', (event) => {
    if (!isTrustedMainFrame(event)) throw new Error('Unauthorized IPC sender.');
    quitAndInstallUpdate();
    return { success: true };
  });
}
