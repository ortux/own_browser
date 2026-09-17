/**
 * GmailAdapter
 * Connects to Gmail via the Google OAuth2 + Gmail API.
 *
 * Mechanism:
 *   1. OAuth2 PKCE flow (opens browser popup, same pattern as AuthPortal)
 *   2. gmail.users.messages.list polling as fallback (push notifications
 *      require a public HTTPS webhook endpoint, not practical for a desktop
 *      browser — polling every 60 s is acceptable for personal use)
 *   3. Incremental: stores historyId/pageToken so each poll only fetches deltas
 *
 * Environment variables required (set via Settings → Integrations):
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET   (optional for PKCE-only flow)
 *   GMAIL_REDIRECT_URI    (e.g. http://localhost:PORT/auth/gmail/callback)
 */

import { Integration } from '../Integration';
import type { IntegrationCapabilities } from '../Integration';
import type { NormalizedEvent } from '../types/events';
import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  historyId?: string;
}

export interface GmailTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in:   number;
  token_type:   string;
  expiresAt?:   number; // computed: Date.now() + expires_in * 1000
}

export class GmailAdapter extends Integration {
  readonly id      = 'gmail';
  readonly name    = 'Gmail';
  readonly version = '1.0.0';
  readonly capabilities: IntegrationCapabilities = {
    notifications: true,
    messaging: false,
    webhooks: false,   // push requires public endpoint
    realtime: false,
    polling: true,
  };

  private tokens:     GmailTokenSet | null = null;
  private historyId:  string | null   = null;
  private pollTimer:  NodeJS.Timeout | null = null;
  private pollMs      = 60_000; // 1 minute

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.state.transition('initializing');
    // Load stored tokens from secure storage (safeStorage / keytar)
    const stored = this.loadStoredTokens();
    if (stored) this.tokens = stored;
  }

  async connect(): Promise<void> {
    if (!this.tokens) {
      this.state.transition('auth_required', {
        code: 'AUTH_REQUIRED',
        message: 'No Gmail credentials — please connect via Settings → Integrations.',
        recoverable: true,
      });
      return;
    }

    this.state.transition('connecting');

    try {
      await this.refreshIfNeeded();
      // Initial poll (fetches recent unread messages)
      await this.poll();

      this.state.transition('connected');
      console.info('[GmailAdapter] connected for', this.account.email);

      // Start periodic polling
      this.pollTimer = setInterval(() => this.safePoll(), this.pollMs);
    } catch (err) {
      console.error('[GmailAdapter] connect error:', err);
      this.state.transition('error', {
        code: 'NETWORK_ERROR',
        message: String(err),
        recoverable: true,
      });
      this.emitError(err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopTimer();
    this.state.transition('disconnected');
  }

  async destroy(): Promise<void> {
    await this.disconnect();
  }

  /** Called by the OAuth flow in the renderer once the code is exchanged. */
  async applyTokens(tokens: GmailTokenSet): Promise<void> {
    tokens.expiresAt = Date.now() + tokens.expires_in * 1_000;
    this.tokens = tokens;
    this.storeTokens(tokens);
    // Reconnect with the new tokens
    await this.reconnect();
  }

  clearStoredTokens(): void {
    try {
      fs.rmSync(
        path.join(app.getPath('userData'), 'gmail-tokens', `${this.account.id}.bin`),
        { force: true }
      );
    } catch (err) {
      console.warn('[GmailAdapter] Could not remove stored tokens:', err);
    }
    this.tokens = null;
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private async safePoll() {
    try { await this.poll(); }
    catch (err) { console.warn('[GmailAdapter] poll error:', err); }
  }

  private async poll(): Promise<void> {
    await this.refreshIfNeeded();
    const token = this.tokens!.access_token;

    let url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:unread';
    if (this.historyId) {
      // Only fetch messages newer than our last checkpoint
      url += `&after=${Math.floor(Date.now() / 1000 - this.pollMs / 1000 * 2)}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.tokens = null;
        this.state.transition('auth_required', {
          code: 'AUTH_EXPIRED',
          message: 'Gmail token expired.',
          recoverable: true,
        });
        throw new Error('Gmail authorization expired');
      }
      throw new Error(`Gmail API request failed (${res.status})`);
    }

    const data: GmailListResponse = await res.json();
    if (!data.messages?.length) return;

    // Update checkpoint so next poll only fetches newer items
    if (data.historyId) this.historyId = data.historyId;

    // Fetch details for each new message (parallel, capped at 5)
    const slice = data.messages.slice(0, 5);
    const details = await Promise.allSettled(
      slice.map((m) => this.fetchMessage(m.id, token))
    );

    for (const result of details) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const event = this.toEvent(result.value);
      if (event) this.emitEvent(event);
    }
  }

  private async fetchMessage(id: string, token: string): Promise<GmailMessage | null> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return res.json();
  }

  private toEvent(msg: GmailMessage): NormalizedEvent | null {
    if (!msg.snippet) return null;

    const headers = msg.payload?.headers ?? [];
    const from    = headers.find((h) => h.name === 'From')?.value ?? '';
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';

    return {
      id:        `gmail-${msg.id}`,
      provider:  'gmail',
      accountId: this.account.id,
      type:      'email.received',
      timestamp: msg.internalDate ? Number(msg.internalDate) : Date.now(),
      data: {
        messageId: msg.id,
        sender:    from,
        subject,
        preview:   msg.snippet,
        url:       `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
      },
    };
  }

  // ── Token management ──────────────────────────────────────────────────────

  private async refreshIfNeeded(): Promise<void> {
    if (!this.tokens) return;
    const expiresAt = this.tokens.expiresAt ?? 0;
    const needsRefresh = Date.now() > expiresAt - 120_000; // refresh 2 min early

    if (!needsRefresh || !this.tokens.refresh_token) return;

    const clientId     = process.env.GMAIL_CLIENT_ID ?? '';
    const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? '';

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: this.tokens.refresh_token,
        client_id:     clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!res.ok) {
      this.tokens = null;
      throw new Error('Token refresh failed');
    }

    const fresh: GmailTokenSet = await res.json();
    fresh.refresh_token = fresh.refresh_token ?? this.tokens.refresh_token;
    fresh.expiresAt     = Date.now() + fresh.expires_in * 1_000;
    this.tokens = fresh;
    this.storeTokens(fresh);
  }

  // ── Secure storage stubs (replace with safeStorage / keytar) ─────────────

  private loadStoredTokens(): GmailTokenSet | null {
    try {
      const file = path.join(app.getPath('userData'), 'gmail-tokens', `${this.account.id}.bin`);
      if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) return null;
      const encrypted = fs.readFileSync(file, 'utf8');
      return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))) as GmailTokenSet;
    } catch { return null; }
  }

  private storeTokens(tokens: GmailTokenSet) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Gmail tokens cannot be stored because the OS keychain is unavailable.');
    }
    const directory = path.join(app.getPath('userData'), 'gmail-tokens');
    fs.mkdirSync(directory, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64');
    const target = path.join(directory, `${this.account.id}.bin`);
    const temp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temp, encrypted, { mode: 0o600 });
    fs.renameSync(temp, target);
  }

  private stopTimer() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}
