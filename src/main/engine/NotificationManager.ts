/**
 * NotificationManager
 * Receives processed events from EventProcessor, deduplicates them,
 * persists them to SQLite, fires desktop toasts, and pushes to the renderer.
 */

import { Notification, BrowserWindow, nativeImage } from 'electron';
import { randomUUID } from 'crypto';
import type { NormalizedEvent } from './types/events';
import { eventProcessor } from './EventProcessor';
import {
  isEventProcessed,
  markEventProcessed,
  saveNotification,
  getUnreadCount,
} from '../db';
import type { EngineNotification } from '../db';

// Renderer push channel names
const CHANNEL_NEW  = 'engine:notification:new';
const CHANNEL_BADGE = 'engine:badge:update';

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
}

function push(channel: string, payload: unknown) {
  getMainWindow()?.webContents.send(channel, payload);
}

function toTitle(event: NormalizedEvent): string {
  const { type, provider, data } = event;
  if (type === 'email.received')
    return `New email — ${typeof data.sender === 'string' ? data.sender : provider}`;
  if (type === 'message.received' || type === 'direct.message')
    return `Message from ${typeof data.sender === 'object' && data.sender !== null
      ? (data.sender as Record<string, unknown>).name ?? provider
      : provider}`;
  if (type === 'calendar.event.starting')
    return `Starting soon: ${typeof data.title === 'string' ? data.title : 'Event'}`;
  if (type === 'pr.review_requested') return 'PR review requested';
  if (type === 'ci.failed') return 'Build failed';
  return `${provider}: ${type}`;
}

function toBody(event: NormalizedEvent): string {
  const { data } = event;
  if (typeof data.preview === 'string') return data.preview;
  if (typeof data.body === 'string') return data.body;
  if (typeof data.subject === 'string') return data.subject;
  if (typeof data.title === 'string') return data.title;
  return '';
}

function toActionUrl(event: NormalizedEvent): string | null {
  if (typeof event.data.url === 'string') return event.data.url;
  if (typeof event.data.action_url === 'string') return event.data.action_url;
  return null;
}

export class NotificationManager {
  private unsubscribe: (() => void) | null = null;
  private desktopEnabled = true;

  start() {
    this.unsubscribe = eventProcessor.onProcessed((event) =>
      this.handle(event).catch((err) =>
        console.error('[NotificationManager] handle error:', err)
      )
    );
    console.info('[NotificationManager] started');
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  setDesktopEnabled(enabled: boolean) {
    this.desktopEnabled = enabled;
  }

  private async handle(event: NormalizedEvent) {
    // ── Deduplication ──────────────────────────────────────────────────────
    if (isEventProcessed(event.id)) {
      console.info('[NotificationManager] Ignoring duplicate event:', event.id);
      return;
    }
    markEventProcessed(event.id, event.provider);

    // ── Build DB row ───────────────────────────────────────────────────────
    const title   = toTitle(event);
    const body    = toBody(event);
    const actionUrl = toActionUrl(event);

    const row: Omit<EngineNotification, 'read_at' | 'dismissed_at'> = {
      id:          randomUUID(),
      provider:    event.provider,
      account_id:  event.accountId,
      event_type:  event.type,
      title,
      body:        body || null,
      icon:        typeof event.data.icon === 'string' ? event.data.icon : null,
      action_url:  actionUrl,
      payload:     JSON.stringify(event.data),
      priority:    event.priority ?? 'normal',
      created_at:  event.timestamp,
    };

    const saved = saveNotification(row);
    console.info('[NotificationManager] Notification saved:', saved.id, saved.title);

    // ── Push to renderer notification center ───────────────────────────────
    const uiNotification = {
      id:          saved.id,
      provider:    saved.provider,
      accountId:   saved.account_id,
      eventType:   saved.event_type,
      title:       saved.title,
      body:        saved.body,
      icon:        saved.icon,
      actionUrl:   saved.action_url,
      payload:     saved.payload ? JSON.parse(saved.payload) : null,
      priority:    saved.priority,
      createdAt:   saved.created_at,
      readAt:      null,
      dismissedAt: null,
    };

    push(CHANNEL_NEW, uiNotification);
    push(CHANNEL_BADGE, getUnreadCount());

    // ── Desktop toast ──────────────────────────────────────────────────────
    if (this.desktopEnabled && Notification.isSupported()) {
      this.showDesktopToast(title, body, row.icon, actionUrl);
    } else {
      console.warn('[NotificationManager] Desktop notifications are unavailable or disabled');
    }
  }

  private showDesktopToast(
    title: string,
    body: string,
    iconDataUrl: string | null,
    actionUrl: string | null
  ) {
    const options: Electron.NotificationConstructorOptions = { title, body: body || undefined };

    if (iconDataUrl) {
      try {
        const img = nativeImage.createFromDataURL(iconDataUrl);
        if (!img.isEmpty()) options.icon = img;
      } catch { /* skip icon */ }
    }

    const toast = new Notification(options);

    toast.on('click', () => {
      const win = getMainWindow();
      if (!win) return;
      win.show();
      win.focus();
      if (actionUrl) {
        win.webContents.send('engine:open-tab', actionUrl);
      }
    });

    toast.show();
  }
}

// Singleton
export const notificationManager = new NotificationManager();
