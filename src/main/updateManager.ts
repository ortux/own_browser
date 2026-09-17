import { app, BrowserWindow } from 'electron';
import { autoUpdater, type UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import {
  initialUpdateInfo,
  parseReleaseChannel,
  userFacingUpdateError,
  type ReleaseChannel,
  type UpdateInfo,
} from '../shared/updater';

const STARTUP_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1_000;

export class UpdateManager {
  private readonly currentVersion: string;
  private readonly channel: ReleaseChannel;
  private readonly feedUrl: string | null;
  private state: UpdateInfo;
  private timer: NodeJS.Timeout | null = null;
  private lastCheckAt = 0;
  private initialized = false;
  private downloadStarted = false;
  private listeners = new Set<(state: UpdateInfo) => void>();

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    options: { currentVersion?: string; channel?: ReleaseChannel; feedUrl?: string } = {}
  ) {
    this.currentVersion = options.currentVersion ?? app.getVersion();
    this.channel = options.channel ?? parseReleaseChannel(process.env.ZYPHORA_UPDATE_CHANNEL);
    this.feedUrl = options.feedUrl ?? process.env.ZYPHORA_UPDATE_URL ?? null;
    this.state = initialUpdateInfo(this.currentVersion, this.channel);
  }

  getState(): UpdateInfo {
    return { ...this.state };
  }

  onStateChanged(listener: (state: UpdateInfo) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.info(`[Updater] initialized currentVersion=${this.currentVersion} channel=${this.channel}`);

    if (!app.isPackaged) {
      this.setState({ state: 'idle' });
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = this.channel !== 'stable';
    autoUpdater.channel = this.channel;

    if (this.feedUrl) {
      if (!this.isTrustedFeedUrl(this.feedUrl)) {
        this.setError('CONFIGURATION_ERROR', 'Updates are not configured for this build.');
        return;
      }
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: this.feedUrl.endsWith('/') ? this.feedUrl : `${this.feedUrl}/`,
      });
    }

    this.bindUpdaterEvents();

    this.timer = setTimeout(() => {
      void this.checkForUpdates();
      this.timer = setInterval(() => void this.checkForUpdates(), CHECK_INTERVAL_MS);
      this.timer.unref();
    }, STARTUP_DELAY_MS);
    this.timer.unref();
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged || !this.feedUrl || this.state.state === 'downloading' || this.state.state === 'installing') return;
    const now = Date.now();
    if (now - this.lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
    this.lastCheckAt = now;
    this.setState({ state: 'checking', errorCode: undefined, errorMessage: undefined });
    console.info('[Updater] checking');
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setErrorFrom(error);
    }
  }

  async downloadUpdate(): Promise<void> {
    if (this.state.state !== 'available' || this.downloadStarted) return;
    this.downloadStarted = true;
    this.setState({ state: 'downloading', downloadProgress: 0 });
    console.info('[Updater] downloading');
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.downloadStarted = false;
      this.setErrorFrom(error);
    }
  }

  installUpdate(): void {
    if (this.state.state !== 'downloaded' || !this.state.canInstall) return;
    this.setState({ state: 'installing', canInstall: false });
    console.info('[Updater] installing');
    autoUpdater.quitAndInstall(false, true);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private bindUpdaterEvents(): void {
    autoUpdater.removeAllListeners();
    autoUpdater.on('checking-for-update', () => this.setState({ state: 'checking' }));
    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      console.info(`[Updater] updateAvailable=${info.version}`);
      this.downloadStarted = false;
      this.setState({
        state: 'available',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: this.releaseNotes(info.releaseNotes),
        canInstall: false,
      });
    });
    autoUpdater.on('update-not-available', () => {
      console.info('[Updater] upToDate');
      this.setState({ state: 'up_to_date', canInstall: false });
    });
    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        state: 'downloading',
        downloadProgress: Math.max(0, Math.min(100, progress.percent)),
        bytesDownloaded: progress.transferred,
        totalBytes: progress.total,
      });
    });
    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      console.info('[Updater] downloadCompleted verificationPassed readyToInstall');
      this.downloadStarted = false;
      this.setState({
        state: 'downloaded',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: this.releaseNotes(info.releaseNotes),
        downloadProgress: 100,
        canInstall: true,
      });
    });
    autoUpdater.on('error', (error) => this.setErrorFrom(error));
  }

  private setState(patch: Partial<UpdateInfo>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('updater:state-changed', snapshot);
  }

  private setError(code: string, message: string): void {
    console.warn(`[Updater] error code=${code} message=${message}`);
    this.setState({ state: 'error', errorCode: code, errorMessage: message, canInstall: false });
  }

  private setErrorFrom(error: unknown): void {
    const safe = userFacingUpdateError(error);
    this.setError(safe.code, safe.message);
  }

  private releaseNotes(notes: string | Array<{ version?: string; note?: string | null }> | null | undefined): string | undefined {
    if (typeof notes === 'string') return notes.slice(0, 20_000);
    if (Array.isArray(notes)) return notes.map((entry) => entry.note ?? '').filter(Boolean).join('\n').slice(0, 20_000) || undefined;
    return undefined;
  }

  private isTrustedFeedUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || (!app.isPackaged && url.hostname === 'localhost');
    } catch {
      return false;
    }
  }
}

export function createUpdateManager(getWindow: () => BrowserWindow | null): UpdateManager {
  return new UpdateManager(getWindow);
}
