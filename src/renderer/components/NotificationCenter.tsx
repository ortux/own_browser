import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, X, Check, CheckCheck, Trash2, Mail, MessageSquare, Send,
  Calendar, GitPullRequest, AlertCircle, Zap, RefreshCw,
} from 'lucide-react';
import type { EngineNotificationUI } from '../../shared/types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when a notification's action URL should open in a tab. */
  onOpenUrl: (url: string) => void;
  fullPage?: boolean;
}

// ── Provider icon mapping ─────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  gmail:    '#EA4335',
  whatsapp: '#25D366',
  slack:    '#4A154B',
  github:   '#24292F',
  calendar: '#1A73E8',
  teams:    '#6264A7',
  linkedin: '#0A66C2',
  discord:  '#5865F2',
  mock:     '#6366F1',
};

function ProviderDot({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] ?? '#888';
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: color }}
    />
  );
}

function EventIcon({ type }: { type: string }) {
  const cls = 'shrink-0 text-[var(--text-faint)]';
  if (type.startsWith('email'))    return <Mail size={13} className={cls} />;
  if (type.startsWith('message') || type.startsWith('direct'))
                                   return <MessageSquare size={13} className={cls} />;
  if (type.startsWith('calendar')) return <Calendar size={13} className={cls} />;
  if (type.startsWith('pr') || type.startsWith('ci'))
                                   return <GitPullRequest size={13} className={cls} />;
  if (type === 'alert')            return <AlertCircle size={13} className={cls} />;
  return <Zap size={13} className={cls} />;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(ms).toLocaleDateString();
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'unread' | string; // string = provider name

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  onOpenUrl,
  fullPage = false,
}) => {
  const [notifications, setNotifications] = useState<EngineNotificationUI[]>([]);
  const [filter, setFilter]               = useState<FilterMode>('all');
  const [loading, setLoading]             = useState(false);
  const [badge, setBadge]                 = useState(0);
  const [replyText, setReplyText]         = useState<Record<string, string>>({});
  const [replying, setReplying]           = useState<string | null>(null);
  const [replyErrors, setReplyErrors]     = useState<Record<string, string>>({});
  const unsubRef = useRef<Array<() => void>>([]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!window.browserAPI?.engine) return;
    setLoading(true);
    try {
      const opts = filter === 'unread'
        ? { unreadOnly: true, limit: 100 }
        : filter === 'all'
          ? { limit: 100 }
          : { provider: filter, limit: 100 };
      const data = await window.browserAPI.engine.notifications.get(opts);
      setNotifications(data);
      const count = await window.browserAPI.engine.notifications.unreadCount();
      setBadge(count);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  // ── Live push ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.browserAPI?.engine) return;

    const unsubs = [
      window.browserAPI.engine.notifications.onNew((n) => {
        setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
      }),
      window.browserAPI.engine.notifications.onBadgeUpdate((count) => {
        setBadge(count);
      }),
      window.browserAPI.engine.onOpenTab((url) => {
        onOpenUrl(url);
        onClose();
      }),
    ];

    unsubRef.current = unsubs;
    return () => unsubs.forEach((u) => u());
  }, [onOpenUrl, onClose]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    await window.browserAPI?.engine.notifications.markRead(id);
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, readAt: Date.now() } : n)
    );
    setBadge((b) => Math.max(0, b - 1));
  }, []);

  const dismiss = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.browserAPI?.engine.notifications.dismiss(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setBadge((b) => Math.max(0, b - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await window.browserAPI?.engine.notifications.markAllRead(
      filter !== 'all' && filter !== 'unread' ? filter : undefined
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
    setBadge(0);
  }, [filter]);

  const clearAll = useCallback(async () => {
    await window.browserAPI?.engine.notifications.clear();
    setNotifications([]);
    setBadge(0);
  }, []);

  const openAction = useCallback(async (n: EngineNotificationUI) => {
    if (!n.readAt) await markRead(n.id);
    if (n.actionUrl) {
      await window.browserAPI?.engine.notifications.openAction(n.id);
      onOpenUrl(n.actionUrl);
      onClose();
    }
  }, [markRead, onOpenUrl, onClose]);

  const sendReply = useCallback(async (n: EngineNotificationUI, event: React.FormEvent) => {
    event.preventDefault();
    const text = (replyText[n.id] ?? '').trim();
    if (!text || replying) return;
    setReplying(n.id);
    setReplyErrors((current) => {
      const next = { ...current };
      delete next[n.id];
      return next;
    });
    try {
      const reply = window.browserAPI?.engine?.notifications?.reply;
      if (typeof reply !== 'function') {
        throw new Error('Reply is unavailable until Zyphora is restarted.');
      }
      await reply(n.id, text);
      setReplyText((current) => ({ ...current, [n.id]: '' }));
    } catch (error) {
      setReplyErrors((current) => ({
        ...current,
        [n.id]: error instanceof Error ? error.message : 'Reply failed',
      }));
    } finally {
      setReplying(null);
    }
  }, [replyText, replying]);

  // ── Derive filter tabs from current notifications ─────────────────────────

  const providers = [...new Set(notifications.map((n) => n.provider))];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const visible = notifications.filter((n) => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.readAt;
    return n.provider === filter;
  });

  if (!isOpen) return null;

  return (
    <div className={`flex flex-col h-full bg-[var(--surface)] ${fullPage ? '' : 'border-l border-[var(--border)]'}`}>

      {/* ── Header ── */}
      <div className={`flex items-center justify-between border-b border-[var(--border)] shrink-0 ${fullPage ? 'px-8 py-5' : 'px-4 py-3'}`}>
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-[var(--text)]" />
          <div>
            <span className={`${fullPage ? 'text-lg' : 'text-sm'} font-semibold text-[var(--text)]`}>Notifications</span>
            {fullPage && <p className="text-xs text-[var(--text-faint)] mt-0.5">Messages, alerts, and replies in one place</p>}
          </div>
          {badge > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold leading-none">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void load()} title="Refresh"
            className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={markAllRead} title="Mark all read"
            className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors">
            <CheckCheck size={13} />
          </button>
          <button onClick={clearAll} title="Clear all"
            className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
          <button onClick={onClose} title="Close"
            className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className={`flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto shrink-0 ${fullPage ? 'px-8 py-3' : 'px-3 py-2'}`}>
        {(['all', 'unread', ...providers] as FilterMode[]).map((f) => {
          const label = f === 'all' ? 'All'
            : f === 'unread' ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`
            : f.charAt(0).toUpperCase() + f.slice(1);
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── List ── */}
      <div className={`flex-1 overflow-y-auto ${fullPage ? 'px-8 py-4' : ''}`}>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
            <Bell size={32} className="text-[var(--text-faint)] opacity-30" />
            <p className="text-sm text-[var(--text-faint)]">
              {filter === 'unread' ? 'All caught up!' : 'No notifications'}
            </p>
          </div>
        )}

        {!loading && visible.map((n) => (
          <div
            key={n.id}
            onClick={() => void openAction(n)}
            className={`group relative flex gap-3 px-4 py-3 ${fullPage ? 'max-w-4xl mx-auto mb-2 rounded-xl border border-[var(--border)]' : 'border-b'} ${n.provider === 'whatsapp' ? 'pb-12' : ''} cursor-pointer transition-colors hover:bg-[var(--hover)] ${
              !n.readAt ? 'bg-[var(--accent-soft)]' : ''
            }`}
          >
            {/* Unread dot */}
            {!n.readAt && (
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            )}
            {n.provider === 'whatsapp' && n.payload && typeof n.payload.chatId === 'string' && (
              <form
                onSubmit={(event) => void sendReply(n, event)}
                onClick={(event) => event.stopPropagation()}
                className="absolute left-10 right-3 bottom-1 flex gap-1"
              >
                <input
                  value={replyText[n.id] ?? ''}
                  onChange={(event) => setReplyText((current) => ({ ...current, [n.id]: event.target.value }))}
                  placeholder="Reply on WhatsApp..."
                  maxLength={4096}
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
                />
                <button type="submit" disabled={replying === n.id} title="Send reply"
                  className="rounded bg-[#25D366] px-2 text-white disabled:opacity-50">
                  <Send size={12} />
                </button>
                {replyErrors[n.id] && replying === null && (
                  <span className="absolute right-0 top-full mt-1 text-[10px] text-red-400">{replyErrors[n.id]}</span>
                )}
              </form>
            )}

            {/* Icon */}
            <div className="shrink-0 mt-0.5 flex flex-col items-center gap-1">
              <EventIcon type={n.eventType} />
              <ProviderDot provider={n.provider} />
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug truncate ${!n.readAt ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                {n.title ?? n.eventType}
              </p>
              {n.body && (
                <p className="text-xs text-[var(--text-faint)] mt-0.5 line-clamp-2 leading-relaxed">
                  {n.body}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-[var(--text-faint)]">{timeAgo(n.createdAt)}</span>
                <span className="text-[10px] text-[var(--text-faint)] capitalize">{n.provider}</span>
                {n.priority === 'urgent' && (
                  <span className="text-[10px] px-1 rounded bg-red-500/20 text-red-400 font-medium">urgent</span>
                )}
                {n.priority === 'high' && (
                  <span className="text-[10px] px-1 rounded bg-orange-500/15 text-orange-400 font-medium">high</span>
                )}
              </div>
            </div>

            {/* Actions (visible on hover) */}
            <div className="shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!n.readAt && (
                <button
                  onClick={(e) => { e.stopPropagation(); void markRead(n.id); }}
                  title="Mark read"
                  className="p-1 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] hover:text-[var(--accent)]"
                >
                  <Check size={12} />
                </button>
              )}
              <button
                onClick={(e) => void dismiss(n.id, e)}
                title="Dismiss"
                className="p-1 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
