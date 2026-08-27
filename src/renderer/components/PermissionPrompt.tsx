import React, { useEffect, useState } from 'react';
import {
  Camera,
  Mic,
  MapPin,
  Bell,
  Clipboard,
  Monitor,
  Maximize2,
  MousePointer2,
  Usb,
  HardDrive,
  ShieldAlert,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionRequest } from '../../shared/types';

interface ActiveRequest extends PermissionRequest {
  tabId?: string;
}

const DESCRIPTIONS: Record<string, string> = {
  media: 'This site can see and hear you while this tab is open.',
  geolocation: 'This site wants to know your approximate physical location.',
  notifications: 'This site wants to show you notifications, even when you are not on it.',
  'clipboard-read': 'This site wants to read what is on your clipboard.',
  'clipboard-write': 'This site wants to write to your clipboard.',
  'display-capture': 'This site wants to capture your screen or a window.',
  fullscreen: 'This site wants to switch to fullscreen.',
  pointerLock: 'This site wants to lock your mouse pointer.',
  midi: 'This site wants to access MIDI music devices.',
  midiSysex: 'This site wants to access MIDI devices (including system-exclusive messages).',
  usb: 'This site wants to access a USB device.',
  hid: 'This site wants to access a HID device.',
  'persistent-storage': 'This site wants to store data on your device.',
};

const FALLBACK_ICON = ShieldAlert;

function iconFor(req: PermissionRequest): LucideIcon {
  if (req.permission === 'media') {
    const types = req.mediaTypes ?? [];
    if (types.includes('audio') && !types.includes('video')) return Mic;
    return Camera;
  }
  switch (req.permission) {
    case 'geolocation': return MapPin;
    case 'notifications': return Bell;
    case 'clipboard-read':
    case 'clipboard-write': return Clipboard;
    case 'display-capture': return Monitor;
    case 'fullscreen': return Maximize2;
    case 'pointerLock': return MousePointer2;
    case 'midi':
    case 'midiSysex': return Usb;
    case 'usb': return Usb;
    case 'hid': return Usb;
    case 'persistent-storage': return HardDrive;
    default: return FALLBACK_ICON;
  }
}

export const PermissionPrompt: React.FC = () => {
  const [requests, setRequests] = useState<ActiveRequest[]>([]);

  useEffect(() => {
    if (!window.browserAPI?.onPermissionRequest) return;
    const unsub = window.browserAPI.onPermissionRequest((req) => {
      setRequests((prev) => {
        if (prev.some((r) => r.requestId === req.requestId)) return prev;
        return [...prev, req];
      });
    });
    return unsub;
  }, []);

  const resolve = (req: ActiveRequest, allow: boolean) => {
    setRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
    void window.browserAPI?.respondPermission(req.requestId, allow);
  };

  if (requests.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-30 flex flex-col gap-2 items-end w-[min(92vw,360px)] pointer-events-none">
      {requests.map((req) => {
        const Icon = iconFor(req);
        const description =
          req.permission === 'media'
            ? `This site can use ${req.label} while this tab is open.`
            : (DESCRIPTIONS[req.permission] ?? `This site wants to use ${req.label}.`);
        return (
          <div
            key={req.requestId}
            className="pointer-events-auto w-full bg-[var(--surface)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden"
          >
            <div className="flex items-start gap-3 p-4">
              <div className="shrink-0 grid place-items-center w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">{req.host}</p>
                <p className="text-sm text-[var(--text)] mt-0.5">
                  wants to use <span className="font-medium">{req.label}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">{description}</p>
              </div>
              <button
                onClick={() => resolve(req, false)}
                aria-label="Dismiss"
                className="shrink-0 -mr-1 -mt-1 p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 pb-3">
              <button
                onClick={() => resolve(req, false)}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              >
                Block
              </button>
              <button
                onClick={() => resolve(req, true)}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
              >
                <Check size={15} />
                Allow
              </button>
            </div>

            <div className="h-0.5 w-full bg-[var(--accent-soft)]" />
          </div>
        );
      })}
    </div>
  );
};
