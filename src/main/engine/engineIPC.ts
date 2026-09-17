/**
 * engineIPC.ts
 * Registers all Application Engine IPC handlers.
 * Called once from main/index.ts after the engine is started.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { applicationEngine } from './ApplicationEngine';
import type { IntegrationAccount } from './Integration';
import { WhatsAppAdapter, WA_QR_CHANNEL, WA_STATUS_CHANNEL } from './integrations/WhatsAppAdapter';
import { GmailAdapter, type GmailTokenSet } from './integrations/GmailAdapter';
import {
  getEngineAccounts,
  saveEngineAccount,
  deleteEngineAccount,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  getUnreadCount,
  clearEngineNotifications,
} from '../db';
import type { EngineAccount, EngineNotification } from '../db';
import type {
  EngineNotificationUI,
  EngineAccountUI,
  IntegrationStatusUI,
  EngineHealthUI,
} from '../../shared/types';

// ── Security helper (re-used from main) ───────────────────────────────────────
// We import the same trust check used by the rest of the app.
type IpcEvent = Electron.IpcMainInvokeEvent;

function isBoundedString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0');
}

function isWhatsAppChatId(value: unknown): value is string {
  return isBoundedString(value, 256) &&
    /^[A-Za-z0-9._-]+@(c\.us|g\.us|lid|broadcast|newsletter)$/.test(value);
}

function parseGmailTokens(value: unknown): GmailTokenSet {
  if (!value || typeof value !== 'object') throw new Error('Invalid Gmail token payload.');
  const candidate = value as Partial<GmailTokenSet> & {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiresIn?: unknown;
    expires_at?: unknown;
    expiresAt?: unknown;
  };
  const accessToken = isBoundedString(candidate.access_token, 4096)
    ? candidate.access_token
    : isBoundedString(candidate.accessToken, 4096) ? candidate.accessToken : null;
  const refreshToken = isBoundedString(candidate.refresh_token, 4096)
    ? candidate.refresh_token
    : isBoundedString(candidate.refreshToken, 4096) ? candidate.refreshToken : undefined;
  const rawExpires = candidate.expires_in ?? candidate.expiresIn;
  const expiryTimestamp = candidate.expires_at ?? candidate.expiresAt;
  const expiresIn = typeof rawExpires === 'number'
    ? rawExpires
    : typeof rawExpires === 'string' ? Number(rawExpires)
      : typeof expiryTimestamp === 'number' ? Math.max(1, Math.floor((expiryTimestamp - Date.now()) / 1_000))
        : typeof expiryTimestamp === 'string' ? Math.max(1, Math.floor((Number(expiryTimestamp) - Date.now()) / 1_000))
          : NaN;
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Invalid Gmail token payload: Google access token and expiry are required.');
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    token_type: isBoundedString(candidate.token_type, 32) ? candidate.token_type : 'Bearer',
  };
}

// ── Helpers: DB row → UI shape ─────────────────────────────────────────────────

function dbNotificationToUI(n: EngineNotification): EngineNotificationUI {
  let payload: Record<string, unknown> | null = null;
  if (typeof n.payload === 'string') {
    try { payload = JSON.parse(n.payload); } catch { /* ignore */ }
  }
  return {
    id: n.id as string,
    provider: n.provider as string,
    accountId: (n.account_id as string | null) ?? null,
    eventType: n.event_type as string,
    title: (n.title as string | null) ?? null,
    body: (n.body as string | null) ?? null,
    icon: (n.icon as string | null) ?? null,
    actionUrl: (n.action_url as string | null) ?? null,
    payload,
    priority: (n.priority as EngineNotificationUI['priority']) ?? 'normal',
    createdAt: n.created_at as number,
    readAt: (n.read_at as number | null) ?? null,
    dismissedAt: (n.dismissed_at as number | null) ?? null,
  };
}

function dbAccountToUI(a: EngineAccount): EngineAccountUI {
  return {
    id: a.id as string,
    provider: a.provider as string,
    displayName: a.display_name as string,
    email: (a.email as string | null) ?? null,
    avatar: (a.avatar as string | null) ?? null,
  };
}

// ── Register all IPC handlers ─────────────────────────────────────────────────

export function registerEngineHandlers(
  assertTrusted: (event: IpcEvent) => void
) {
  // ── Notifications ──────────────────────────────────────────────────────────

  ipcMain.handle('engine:notifications:get', (event, opts?: { provider?: string; unreadOnly?: boolean; limit?: number }) => {
    assertTrusted(event);
    const rows = getNotifications(opts ?? {});
    return rows.map(dbNotificationToUI);
  });

  ipcMain.handle('engine:notifications:unread-count', (event, provider?: unknown) => {
    assertTrusted(event);
    return getUnreadCount(typeof provider === 'string' ? provider : undefined);
  });

  ipcMain.handle('engine:notifications:mark-read', (event, id: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(id, 256)) throw new Error('Invalid notification ID.');
    markNotificationRead(id);
  });

  ipcMain.handle('engine:notifications:mark-all-read', (event, provider?: unknown) => {
    assertTrusted(event);
    markAllNotificationsRead(typeof provider === 'string' ? provider : undefined);
  });

  ipcMain.handle('engine:notifications:dismiss', (event, id: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(id, 256)) throw new Error('Invalid notification ID.');
    dismissNotification(id);
  });

  ipcMain.handle('engine:notifications:clear', (event) => {
    assertTrusted(event);
    clearEngineNotifications();
  });

  // ── Accounts ───────────────────────────────────────────────────────────────

  ipcMain.handle('engine:accounts:list', (event, provider?: unknown) => {
    assertTrusted(event);
    const rows = getEngineAccounts(typeof provider === 'string' ? provider : undefined);
    return rows.map(dbAccountToUI);
  });

  ipcMain.handle('engine:accounts:add', async (event, account: unknown) => {
    assertTrusted(event);
    const a = account as Partial<IntegrationAccount> & { gmailTokens?: unknown };
    if (!isBoundedString(a?.id, 256)) throw new Error('Invalid account id.');
    if (!isBoundedString(a?.provider, 64)) throw new Error('Invalid provider.');
    const row = saveEngineAccount({
      id: a.id!,
      provider: a.provider!,
      display_name: typeof a.displayName === 'string' ? a.displayName : '',
      email: typeof a.email === 'string' ? a.email : null,
      avatar: null,
    });
    // Start the integration
    const integrationAccount: IntegrationAccount = {
      id: a.id!,
      provider: a.provider!,
      displayName: row.display_name,
      email: row.email ?? undefined,
    };
    await applicationEngine.connect(integrationAccount);
    if (a.provider === 'gmail' && a.gmailTokens) {
      const entry = (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.get(`gmail:${a.id}`);
      if (!(entry instanceof GmailAdapter)) throw new Error('Gmail account is not connected.');
      await entry.applyTokens(parseGmailTokens(a.gmailTokens));
    }
    return dbAccountToUI(row);
  });

  ipcMain.handle('engine:accounts:remove', async (event, id: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(id, 256)) throw new Error('Invalid account id.');
    // Find account to get provider
    const rows = getEngineAccounts();
    const account = rows.find((r) => r.id === id);
    const key = account ? `${account.provider}:${id}` : '';
    const entry = key
      ? (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.get(key)
      : undefined;
    if (account) {
      await applicationEngine.disconnect(account.provider, id).catch(() => { /* best effort */ });
    }
    if (entry instanceof GmailAdapter) entry.clearStoredTokens();
    deleteEngineAccount(id);
  });

  ipcMain.handle('engine:gmail:apply-tokens', async (event, accountId: unknown, tokens: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(accountId, 256)) throw new Error('Invalid Gmail token payload.');
    const key = `gmail:${accountId}`;
    const entry = (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.get(key);
    if (!(entry instanceof GmailAdapter)) throw new Error('Gmail account is not connected.');
    await entry.applyTokens(parseGmailTokens(tokens));
  });

  // ── Integration status ─────────────────────────────────────────────────────

  ipcMain.handle('engine:integrations:status', (event) => {
    assertTrusted(event);
    const statuses = applicationEngine.getAllStatuses();
    return statuses.map((s): IntegrationStatusUI => ({
      provider: s.provider,
      accountId: s.accountId,
      status: s.status,
      connectedAt: s.connectedAt,
      lastEventAt: s.lastEventAt,
      lastError: s.lastError,
    }));
  });

  ipcMain.handle('engine:integrations:health', (event) => {
    assertTrusted(event);
    return applicationEngine.getHealth() as EngineHealthUI;
  });

  ipcMain.handle('engine:integrations:reconnect-all', async (event) => {
    assertTrusted(event);
    await applicationEngine.reconnectAll();
  });

  // ── Open notification action URL in a tab ──────────────────────────────────

  ipcMain.handle('engine:notification:open-action', async (event, id: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(id, 256)) throw new Error('Invalid notification ID.');
    const notification = getNotifications({}).find((row) => row.id === id);
    if (notification?.action_url) {
      markNotificationRead(id);
      // Send to renderer to open in a new tab
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        'engine:open-tab', notification.action_url
      );
    }
  });

  ipcMain.handle('engine:notification:reply', async (event, id: unknown, text: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(id, 256) || typeof text !== 'string') {
      throw new Error('Invalid reply.');
    }
    const replyText = text.trim();
    if (!replyText || replyText.length > 4_096) throw new Error('Reply must be 1-4096 characters.');

    const notification = getNotifications({}).find((row) => row.id === id);
    if (!notification || notification.provider !== 'whatsapp' || !notification.payload) {
      throw new Error('WhatsApp reply target not found.');
    }

    let payload: { chatId?: unknown };
    try { payload = JSON.parse(notification.payload) as { chatId?: unknown }; } catch {
      throw new Error('WhatsApp reply target is invalid.');
    }
    if (!isWhatsAppChatId(payload.chatId)) {
      throw new Error('WhatsApp reply target is invalid.');
    }

    const key = `whatsapp:${notification.account_id}`;
    const entry = (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.get(key);
    if (!(entry instanceof WhatsAppAdapter)) throw new Error('WhatsApp is not connected.');
    await entry.reply(payload.chatId, replyText);
  });

  // ── WhatsApp-specific IPC ──────────────────────────────────────────────────

  /**
   * Retrieve the current QR data-URL for an account that is in auth_required.
   * Used by the Settings panel on mount so it can show the QR immediately
   * without waiting for the next 'engine:whatsapp:qr' push.
   */
  ipcMain.handle('engine:whatsapp:get-qr', (event, accountId: unknown) => {
    assertTrusted(event);
    if (!isBoundedString(accountId, 256)) return null;
    const key   = `whatsapp:${accountId}`;
    const entry = (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.get(key);
    if (entry instanceof WhatsAppAdapter) return entry.getQr();
    return null;
  });

  /**
   * Forward wa-qr events from ALL WhatsApp adapters to the renderer.
   * Called once per registered account when the engine connects it.
   * We attach listeners on ApplicationEngine's 'integration-connected' event
   * so we wire each new WhatsApp adapter as it comes online.
   */
  const wiredWhatsAppAdapters = new WeakSet<WhatsAppAdapter>();

  function wireWhatsAppPush(adapter: unknown) {
    if (!(adapter instanceof WhatsAppAdapter)) return;
    if (wiredWhatsAppAdapters.has(adapter)) return;
    wiredWhatsAppAdapters.add(adapter);

    adapter.on('wa-qr', (payload: { accountId: string; qr: string | null }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send(WA_QR_CHANNEL, payload);
    });

    adapter.on('wa-status', (payload: { accountId: string; status: string }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send(WA_STATUS_CHANNEL, payload);
    });
  }

  // Wire any adapters that restored before handlers were registered
  for (const adapter of (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.values()) {
    wireWhatsAppPush(adapter);
  }

  // Wire future adapters as they connect
  applicationEngine.on('integration-connected', (_account: IntegrationAccount) => {
    // The adapter key is `${provider}:${accountId}`
    const key = `whatsapp:${_account.id}`;
    const adapter = (applicationEngine as unknown as { adapters: Map<string, unknown> }).adapters.get(key);
    wireWhatsAppPush(adapter);
  });
}
