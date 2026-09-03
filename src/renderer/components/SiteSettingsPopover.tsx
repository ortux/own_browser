import React, { useEffect, useState } from 'react';
import {
  Camera,
  MapPin,
  Bell,
  Mic,
  Clipboard,
  Monitor,
  Trash2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

interface SiteSettingsPopoverProps {
  host: string;
  onClose: () => void;
}

const PERMISSIONS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'media', label: 'Camera & microphone', icon: Camera },
  { key: 'geolocation', label: 'Location', icon: MapPin },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'microphone', label: 'Microphone', icon: Mic },
  { key: 'clipboard-read', label: 'Read clipboard', icon: Clipboard },
  { key: 'display-capture', label: 'Screen sharing', icon: Monitor },
];

export const SiteSettingsPopover: React.FC<SiteSettingsPopoverProps> = ({ host, onClose }) => {
  const [decisions, setDecisions] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!window.browserAPI) return;
    setLoading(true);
    try {
      const all = await window.browserAPI.permissions.list();
      setDecisions(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const hostDecisions = decisions[host] ?? {};
  const blocked: string[] = [];
  const allowed: string[] = [];
  for (const p of PERMISSIONS) {
    const v = hostDecisions[p.key];
    if (v === true) allowed.push(p.label);
    else if (v === false) blocked.push(p.label);
  }

  const setDecision = async (perm: string, value: boolean) => {
    await window.browserAPI.permissions.set(host, perm, value);
    await reload();
  };
  const clearDecision = async (perm: string) => {
    await window.browserAPI.permissions.clear(host, perm);
    await reload();
  };
  const resetAll = async () => {
    for (const p of PERMISSIONS) {
      if (hostDecisions[p.key] !== undefined) {
        await window.browserAPI.permissions.clear(host, p.key);
      }
    }
    await reload();
  };

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-80 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-4 text-sm z-50"
      style={{ animation: 'popIn 160ms ease-out' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)]">
          <ShieldCheck size={18} className="text-[var(--accent-fg)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-[var(--text-faint)]">Site settings</div>
          <div className="text-sm font-semibold text-[var(--text)] truncate">{host}</div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-faint)] hover:text-[var(--text)] text-xs shrink-0"
        >
          Close
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-faint)] py-4 text-center">Loading…</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {PERMISSIONS.map((p) => {
              const v = hostDecisions[p.key];
              const Icon = p.icon;
              return (
                <div
                  key={p.key}
                  className="flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-2.5 py-2"
                >
                  <Icon size={14} className="text-[var(--text-muted)] shrink-0" />
                  <span className="text-sm text-[var(--text)] flex-1 truncate">{p.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {v === undefined ? (
                      <span className="text-[10px] text-[var(--text-faint)]">Ask</span>
                    ) : (
                      <>
                        <button
                          onClick={() => setDecision(p.key, true)}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            v === true
                              ? 'bg-[var(--positive-soft)] text-[var(--positive)]'
                              : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                          }`}
                        >
                          Allow
                        </button>
                        <button
                          onClick={() => setDecision(p.key, false)}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            v === false
                              ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                              : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                          }`}
                        >
                          Block
                        </button>
                        <button
                          onClick={() => clearDecision(p.key)}
                          className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] ml-1"
                          title="Reset to ask"
                        >
                          reset
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(allowed.length > 0 || blocked.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              {allowed.length > 0 && (
                <p className="text-[11px] text-[var(--positive)]">
                  Allowed: {allowed.join(', ')}
                </p>
              )}
              {blocked.length > 0 && (
                <p className="text-[11px] text-[var(--danger)] mt-1">
                  Blocked: {blocked.join(', ')}
                </p>
              )}
              <button
                onClick={resetAll}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--text-faint)] hover:text-[var(--danger)]"
              >
                <Trash2 size={11} /> Reset all site permissions
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
