/**
 * WhatsAppAdapter
 * Connects to WhatsApp Web via whatsapp-web.js (Puppeteer-based).
 *
 * Flow:
 *   1. Client initializes → Puppeteer spawns a headless Chromium session
 *   2. If no saved session → emits a QR code data-URL; the renderer displays it
 *   3. User scans QR with their phone → 'authenticated' fires
 *   4. 'ready' fires → adapter transitions to 'connected'
 *   5. On every incoming message: emits a NormalizedEvent of type 'message.received'
 *   6. On missed calls: emits 'call.missed'
 *   7. On auth failure / logout: transitions back to 'auth_required'
 *
 * Session persistence:
 *   whatsapp-web.js LocalAuth stores the Chromium user-data in
 *   <app userData>/whatsapp-sessions/<accountId>/  so the user only
 *   scans QR once per account.
 *
 * Environment / Puppeteer notes:
 *   - Release builds package a Puppeteer-compatible Chrome under resources/whatsapp-chrome.
 *   - Development builds can use a system browser or the Puppeteer cache.
 *   - We pass `--no-sandbox` because Electron already runs in a sandbox;
 *     adding a second one causes launch failures on most platforms.
 */

import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import { Integration } from '../Integration';
import type { IntegrationCapabilities } from '../Integration';
import type { NormalizedEvent, SenderInfo } from '../types/events';

const nodeRequire = createRequire(import.meta.url);

function resolveWhatsAppBrowser(): string {
  const configuredPath = process.env.WHATSAPP_CHROME_PATH;
  const packagedRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'whatsapp-chrome')
    : path.resolve(process.cwd(), 'resources', 'whatsapp-chrome');
  const packagedBrowser = findBrowserExecutable(packagedRoot);
  if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;
  if (packagedBrowser) return packagedBrowser;

  const candidates = [
    ...(process.platform === 'win32' ? [
      path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ] : []),
    ...(process.platform === 'darwin' ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ] : []),
    ...(process.platform === 'linux' ? [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ] : []),
  ];

  const systemBrowser = candidates.find((candidate) => fs.existsSync(candidate));
  if (systemBrowser) return systemBrowser;

  try {
    const puppeteer = nodeRequire('puppeteer') as { executablePath?: () => string };
    const downloadedBrowser = puppeteer.executablePath?.();
    if (downloadedBrowser && fs.existsSync(downloadedBrowser)) return downloadedBrowser;
  } catch {
    // The dependency is loaded below; leave the final error actionable.
  }

  throw new Error(
    'No Chrome/Chromium executable was found for WhatsApp. Install Chrome or set WHATSAPP_CHROME_PATH.'
  );
}

function findBrowserExecutable(root: string, depth = 0): string | null {
  if (!fs.existsSync(root) || depth > 6) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && (entry.name === 'chrome.exe' || entry.name === 'chrome' || entry.name === 'Google Chrome')) {
      return candidate;
    }
    if (entry.isDirectory()) {
      const found = findBrowserExecutable(candidate, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Dynamically imported to avoid bundling issues in the renderer context.
// The heavy Puppeteer dependency lives entirely in the main process.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WAClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WAMessage = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WACall    = any;

// Channel names for IPC push (kept in sync with engineIPC.ts)
export const WA_QR_CHANNEL     = 'engine:whatsapp:qr';
export const WA_STATUS_CHANNEL = 'engine:whatsapp:status';

export class WhatsAppAdapter extends Integration {
  readonly id      = 'whatsapp';
  readonly name    = 'WhatsApp';
  readonly version = '1.0.0';
  readonly capabilities: IntegrationCapabilities = {
    notifications: true,
    messaging:     true,
    webhooks:      false,
    realtime:      true,
    polling:       false,
  };

  private client: WAClient | null = null;
  /** Cached QR as a data-URL so the Settings panel can retrieve it on mount. */
  private lastQr: string | null = null;
  private destroyPromise: Promise<void> | null = null;
  private seenMessageIds = new Set<string>();
  private readyWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private readyTimer: NodeJS.Timeout | null = null;
  private isReady = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.state.transition('initializing');
  }

  async connect(attempt = 0): Promise<void> {
    // Guard: don't double-connect
    if (this.client) return;

    this.state.transition('connecting');

    let Client: typeof import('whatsapp-web.js').Client;
    let LocalAuth: typeof import('whatsapp-web.js').LocalAuth;

    try {
      const wwebjs = nodeRequire('whatsapp-web.js');
      Client    = wwebjs.Client;
      LocalAuth = wwebjs.LocalAuth;
    } catch (err) {
      console.error('[WhatsAppAdapter] Failed to import whatsapp-web.js:', err);
      this.state.transition('error', {
        code: 'NOT_CONFIGURED',
        message: 'whatsapp-web.js could not be loaded. Make sure it is installed.',
        recoverable: false,
      });
      this.emitError(err);
      throw err;
    }

    let browserExecutable: string;
    try {
      browserExecutable = resolveWhatsAppBrowser();
    } catch (err) {
      this.state.transition('error', {
        code: 'NOT_CONFIGURED',
        message: String(err),
        recoverable: false,
      });
      this.emitError(err);
      throw err;
    }

    // Session data goes in userData so it survives app updates
    const sessionDataPath = path.join(
      app.getPath('userData'),
      'whatsapp-sessions'
    );

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId:    this.account.id,
        dataPath:    sessionDataPath,
      }),
      puppeteer: {
        executablePath: browserExecutable,
        // Headless keeps the Chromium window hidden
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    this.attachClientListeners();

    try {
      let resolveReady!: () => void;
      let rejectReady!: (error: Error) => void;
      const readySignal = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      this.readyWaiter = { resolve: resolveReady, reject: rejectReady };
      this.isReady = false;
      await this.client.initialize();
      if (!this.isReady) await readySignal;
    } catch (err) {
      console.error('[WhatsAppAdapter] client.initialize() error:', err);
      await this.destroyClient();
      this.state.transition('error', {
        code: 'UNKNOWN_ERROR',
        message: String(err),
        recoverable: true,
      });
      this.emitError(err);
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        return this.connect(attempt + 1);
      }
      throw err;
    } finally {
      this.clearReadyWatchdog();
      this.readyWaiter = null;
    }
  }

  async disconnect(): Promise<void> {
    await this.destroyClient();
    this.state.transition('disconnected');
    this.lastQr = null;
    this.pushStatus();
  }

  async destroy(): Promise<void> {
    await this.destroyClient();
    this.seenMessageIds.clear();
  }

  /** Returns the last QR as a data-URL, or null if already authenticated. */
  getQr(): string | null {
    return this.lastQr;
  }

  async reply(chatId: string, text: string): Promise<void> {
    if (!this.client || !this.isReady) {
      throw new Error('WhatsApp is not ready');
    }
    await this.client.sendMessage(chatId, text);
  }

  // ── Client event wiring ───────────────────────────────────────────────────

  private attachClientListeners() {
    const c = this.client!;

    c.on('qr', async (qr: string) => {
      console.info('[WhatsAppAdapter] QR received — awaiting scan');
      this.state.transition('auth_required', {
        code: 'AUTH_REQUIRED',
        message: 'Scan the QR code with WhatsApp on your phone.',
        recoverable: true,
      });

      try {
        // Convert the raw QR string to a data-URL using the qrcode package
        const qrcodeLib = await import('qrcode');
        const dataUrl = await qrcodeLib.default.toDataURL(qr, {
          width: 280,
          margin: 2,
          color: { dark: '#111111', light: '#ffffff' },
        });
        this.lastQr = dataUrl;
        this.pushQr(dataUrl);
      } catch (err) {
        console.warn('[WhatsAppAdapter] qrcode generation failed:', err);
        // Fall back: push the raw text; the UI can render it with a library
        this.lastQr = qr;
        this.pushQr(qr);
      }

      // A QR is a valid authentication-required outcome. Do not keep the
      // accounts:add IPC call waiting for ready, or the renderer cannot open
      // the QR modal and the integration appears stuck on Connecting.
      this.readyWaiter?.resolve();
      this.pushStatus();
    });

    c.on('authenticated', () => {
      console.info('[WhatsAppAdapter] Authenticated');
      this.lastQr = null;
      this.pushQr(null);
      this.state.transition('connecting');
      this.pushStatus();
      this.startReadyWatchdog();
    });

    c.on('change_state', (state: string) => {
      console.info('[WhatsAppAdapter] State changed:', state);
    });

    c.on('loading_screen', (percent: number, message: string) => {
      console.info(`[WhatsAppAdapter] Loading WhatsApp Web: ${percent}% ${message}`);
    });

    c.on('auth_failure', (msg: string) => {
      console.error('[WhatsAppAdapter] Auth failure:', msg);
      this.clearReadyWatchdog();
      this.readyWaiter?.reject(new Error(`WhatsApp authentication failed: ${msg}`));
      this.lastQr = null;
      this.state.transition('auth_required', {
        code: 'AUTH_EXPIRED',
        message: msg,
        recoverable: true,
      });
      this.pushStatus();
      this.pushQr(null);
    });

    c.on('ready', () => {
      console.info('[WhatsAppAdapter] Client ready');
      this.isReady = true;
      this.clearReadyWatchdog();
      this.readyWaiter?.resolve();
      this.state.transition('connected');
      this.lastQr = null;
      this.pushStatus();
      this.pushQr(null);
    });

    c.on('disconnected', (reason: string) => {
      console.warn('[WhatsAppAdapter] Disconnected:', reason);
      this.clearReadyWatchdog();
      this.readyWaiter?.reject(new Error(`WhatsApp disconnected: ${reason}`));
      this.client = null;
      this.state.transition('disconnected');
      this.pushStatus();
    });

    c.on('message', (msg: WAMessage) => {
      void this.handleMessage(msg);
    });

    c.on('call', (call: WACall) => {
      void this.handleCall(call);
    });
  }

  // ── Message → NormalizedEvent ─────────────────────────────────────────────

  private async handleMessage(msg: WAMessage) {
    try {
      // Skip status updates (ephemeral broadcast channel)
      if (msg.isStatus) return;
      // Skip messages sent by us
      if (msg.fromMe) return;

      const messageId = this.getMessageId(msg);
      if (messageId) {
        if (this.seenMessageIds.has(messageId)) return;
        this.seenMessageIds.add(messageId);
        if (this.seenMessageIds.size > 2_000) {
          const oldest = this.seenMessageIds.values().next().value;
          if (typeof oldest === 'string') this.seenMessageIds.delete(oldest);
        }
      }
      console.info('[WhatsAppAdapter] Incoming message received');

      let contact: WAMessage | null = null;
      try {
        contact = await msg.getContact();
      } catch (err) {
        console.warn('[WhatsAppAdapter] Contact lookup failed; using message metadata');
      }

      const senderName: string =
        contact?.pushname ||
        contact?.name ||
        contact?.number ||
        msg.from?.split('@')[0] ||
        'Unknown';

      const isGroup = msg.from?.endsWith('@g.us') ?? false;
      let chatName = isGroup ? 'Group' : senderName;
      if (isGroup && typeof msg.getChat === 'function') {
        try {
          const chat = await msg.getChat();
          chatName = chat?.name ?? chatName;
        } catch {
          console.warn('[WhatsAppAdapter] Group name unavailable; using fallback');
        }
      }

      const sender: SenderInfo = {
        id:   msg.from,
        name: isGroup ? `${senderName} @ ${chatName}` : senderName,
      };

      // Build a human-readable body
      let body = msg.body ?? '';
      if (msg.hasMedia && !body) {
        const typeLabel: Record<string, string> = {
          image:    '📷 Image',
          video:    '🎥 Video',
          audio:    '🎵 Audio',
          document: '📄 Document',
          sticker:  '🎭 Sticker',
          location: '📍 Location',
        };
        body = typeLabel[msg.type] ?? '📎 Attachment';
      }

      const event: NormalizedEvent = {
        id:        `whatsapp-msg-${messageId}`,
        provider:  'whatsapp',
        accountId: this.account.id,
        type:      isGroup ? 'channel.message' : 'message.received',
        timestamp: msg.timestamp * 1_000, // whatsapp-web.js gives seconds
        priority:  isGroup ? 'normal' : 'high',
        data: {
          messageId,
          chatId:    msg.from,
          chatName,
          sender,
          preview:   body.slice(0, 200),
          isGroup,
          hasMedia:  msg.hasMedia,
          mediaType: msg.type,
          // Action URL: open web.whatsapp.com in a browser tab
          url: `https://web.whatsapp.com`,
        },
      };

      console.info('[WhatsAppAdapter] Publishing message notification');
      this.emitEvent(event);
    } catch (err) {
      console.warn('[WhatsAppAdapter] handleMessage error:', err);
    }
  }

  private getMessageId(msg: WAMessage): string {
    const id = msg.id;
    if (typeof id?._serialized === 'string' && id._serialized) return id._serialized;
    if (typeof id?.serialized === 'string' && id.serialized) return id.serialized;
    if (typeof id?.id === 'string' && id.id) {
      return `${msg.from ?? 'unknown'}:${id.id}`;
    }

    const fallback = [msg.from, msg.timestamp, msg.type, msg.body].map((value) => String(value ?? '')).join(':');
    console.warn('[WhatsAppAdapter] Message ID unavailable; using metadata fallback');
    return fallback;
  }

  // ── Call → NormalizedEvent ────────────────────────────────────────────────

  private async handleCall(call: WACall) {
    try {
      // Reject the call (we are a notification integration, not a call client)
      if (typeof call.reject === 'function') await call.reject();

      const callerName: string = call.peerJid?.split('@')[0] ?? 'Unknown';

      const event: NormalizedEvent = {
        id:        `whatsapp-call-${call.id ?? randomUUID()}`,
        provider:  'whatsapp',
        accountId: this.account.id,
        type:      'call.missed',
        timestamp: Date.now(),
        priority:  'urgent',
        data: {
          callId: call.id,
          caller: { name: callerName, id: call.peerJid },
          isVideo: call.isVideo ?? false,
          preview: `${call.isVideo ? '📹' : '📞'} Missed call from ${callerName}`,
          url: 'https://web.whatsapp.com',
        },
      };

      this.emitEvent(event);
    } catch (err) {
      console.warn('[WhatsAppAdapter] handleCall error:', err);
    }
  }

  // ── IPC push helpers ──────────────────────────────────────────────────────

  private pushQr(qrDataUrl: string | null) {
    this.emit('wa-qr', { accountId: this.account.id, qr: qrDataUrl });
  }

  private pushStatus(status = this.state.snapshot().status) {
    this.emit('wa-status', {
      accountId: this.account.id,
      status,
    });
  }

  private startReadyWatchdog() {
    this.clearReadyWatchdog();
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null;
      this.readyWaiter?.reject(
        new Error('WhatsApp Web did not become ready after authentication')
      );
    }, 45_000);
  }

  private clearReadyWatchdog() {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  private async destroyClient(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;

    const client = this.client;
    this.client  = null;
    this.lastQr  = null;
    this.isReady = false;
    this.clearReadyWatchdog();

    if (!client) return;

    this.destroyPromise = (async () => {
      try {
        await client.destroy();
      } catch (err) {
        console.warn('[WhatsAppAdapter] destroy error:', err);
      } finally {
        this.destroyPromise = null;
      }
    })();

    return this.destroyPromise;
  }
}
