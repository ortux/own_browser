/**
 * agentNotify.ts — delivers agent notifications through the configured channels.
 *
 * Centralised so every notification respects the user's choices in one place.
 * A notification the user switched off must not appear, and an event they
 * switched off must not fire on any channel.
 */

import { Notification, type BrowserWindow } from 'electron';
import { getAgentConfig } from './agentConfigStore';
import type { NotificationEventId } from '../shared/agentConfig';

let mainWindow: BrowserWindow | null = null;

export function setNotifyWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function notifyAgent(event: NotificationEventId, title: string, body: string): void {
  const config = getAgentConfig();
  const { events, channels } = config.notifications;

  // The event switch wins over the channel switches.
  if (!events[event]) return;

  if (channels.desktop && Notification.isSupported()) {
    try {
      new Notification({
        title: `${config.general.agentName}: ${title}`,
        body,
        silent: !channels.sound,
      }).show();
    } catch (error) {
      console.error('[agent] could not show a desktop notification:', error);
    }
  }

  if (channels.inApp && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent:notification', {
      event,
      title,
      body,
      sound: channels.sound,
    });
  }
}
