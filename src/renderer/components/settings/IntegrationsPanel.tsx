/**
 * IntegrationsPanel.tsx
 * Settings panel for the Application / Notification Engine.
 *
 * WhatsApp flow:
 *   1. User clicks "Connect" → account is created in DB, adapter starts
 *   2. Adapter emits QR → engine:whatsapp:qr push arrives → QRModal opens
 *   3. User scans QR with phone → status becomes "connected" → modal closes
 *   4. If the user dismisses the modal the adapter keeps running; re-opening
 *      Settings re-fetches the current QR via engine:whatsapp:get-qr
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, Mail, MessageSquare, RefreshCw, Trash2,
  CheckCircle2, AlertCircle, WifiOff, Plus, Zap,
  QrCode, X, Smartphone,
} from 'lucide-react';
import type { EngineAccountUI, IntegrationStatusUI, EngineHealthUI } from '../../../shared/types';
import { executeOAuthFlow } from '../../lib/oauthService';

// ── Provider metadata ──────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, {
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  hasQrFlow?: boolean;
}> = {
  gmail: {
    label: 'Gmail',
    icon: <Mail size={18} />,
    color: '#EA4335',
    description: 'Receive desktop notifications for new emails.',
  },
  mock: {
    label: 'Test Integration',
    icon: <Zap size={18} />,
    color: '#6366F1',
    description: 'Sends test notifications every 20 seconds — use to verify the pipeline.',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: <MessageSquare size={18} />,
    color: '#25D366',
    description: 'Get notified of new WhatsApp messages and missed calls.',
    hasQrFlow: true,
  },
};

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected')
    return (
      <span className="flex items-center gap-1 text-xs text-green-400">
        <CheckCircle2 size={11} /> Connected
      </span>
    );
  if (status === 'connecting' || status === 'reconnecting')
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-400">
        <RefreshCw size={11} className="animate-spin" /> {status}
      </span>
    );
  if (status === 'authenticating')
    return (
      <span className="flex items-center gap-1 text-xs text-green-400">
        <CheckCircle2 size={11} /> Authenticated
      </span>
    );
  if (status === 'auth_required')
    return (
      <span className="flex items-center gap-1 text-xs text-orange-400">
        <QrCode size={11} /> Scan QR to connect
      </span>
    );
  if (status === 'initializing')
    return (
      <span className="flex items-center gap-1 text-xs text-blue-400">
        <RefreshCw size={11} className="animate-spin" /> Initializing…
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex items-center gap-1 text-xs text-red-400">
        <AlertCircle size={11} /> Error
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-[var(--text-faint)]">
      <WifiOff size={11} /> Disconnected
    </span>
  );
}

// ── QR Modal ───────────────────────────────────────────────────────────────────

interface QRModalProps {
  accountId: string;
  onClose: () => void;
}

const QRModal: React.FC<QRModalProps> = ({ accountId, onClose }) => {
  const [qr, setQr]         = useState<string | null>(null);
  const [status, setStatus] = useState<string>('auth_required');
  const unsubRef            = useRef<Array<() => void>>([]);

  // Hydrate QR on mount (adapter may have emitted it before we opened)
  useEffect(() => {
    void window.browserAPI?.engine.whatsapp?.getQr(accountId).then((dataUrl) => {
      if (dataUrl) setQr(dataUrl);
    });
  }, [accountId]);

  // Subscribe to live QR and status pushes
  useEffect(() => {
    const api = window.browserAPI?.engine.whatsapp;
    if (!api) return;

    const unsubs = [
      api.onQr(({ accountId: id, qr: dataUrl }) => {
        if (id !== accountId) return;
        setQr(dataUrl);
      }),
      api.onStatus(({ accountId: id, status: s }) => {
        if (id !== accountId) return;
        setStatus(s);
        // Auto-close when authentication completes
        if (s === 'connected' || s === 'authenticating') {
          setTimeout(onClose, 1_200);
        }
      }),
    ];

    unsubRef.current = unsubs;
    return () => unsubs.forEach((u) => u());
  }, [accountId, onClose]);

  const isConnected = status === 'connected' || status === 'authenticating';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ background: '#25D366' }}>
              <MessageSquare size={14} />
            </div>
            <span className="text-sm font-semibold text-[var(--text)]">Connect WhatsApp</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col items-center gap-4">

          {isConnected ? (
            /* Success state */
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <p className="text-sm font-medium text-[var(--text)]">WhatsApp connected!</p>
              <p className="text-xs text-[var(--text-faint)]">You'll receive notifications for new messages.</p>
            </div>
          ) : qr ? (
            /* QR code */
            <>
              <img
                src={qr}
                alt="WhatsApp QR code"
                className="w-[220px] h-[220px] rounded-xl border border-[var(--border)] bg-white p-2"
              />
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm font-medium text-[var(--text)]">Scan with WhatsApp</p>
                <p className="text-xs text-[var(--text-faint)] leading-relaxed max-w-[240px]">
                  Open WhatsApp on your phone → tap the three-dot menu → Linked devices → Link a device
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
                <Smartphone size={12} />
                <span>QR refreshes automatically</span>
              </div>
            </>
          ) : (
            /* Loading / waiting for QR */
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--text-faint)]">Starting WhatsApp session…</p>
              <p className="text-xs text-[var(--text-faint)] text-center max-w-[220px] leading-relaxed">
                This may take up to 30 seconds on first launch while Chromium initialises.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main panel ─────────────────────────────────────────────────────────────────

export const IntegrationsPanel: React.FC = () => {
  const [accounts, setAccounts]   = useState<EngineAccountUI[]>([]);
  const [statuses, setStatuses]   = useState<IntegrationStatusUI[]>([]);
  const [health, setHealth]       = useState<EngineHealthUI | null>(null);
  const [loading, setLoading]     = useState(false);
  const [adding, setAdding]       = useState<string | null>(null);
  const [addError, setAddError]   = useState<string | null>(null);
  /** accountId of the WhatsApp account whose QR modal is open, or null. */
  const [qrAccountId, setQrAccountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.browserAPI?.engine) return;
    setLoading(true);
    try {
      const [accs, stats, h] = await Promise.all([
        window.browserAPI.engine.accounts.list(),
        window.browserAPI.engine.integrations.status(),
        window.browserAPI.engine.integrations.health(),
      ]);
      setAccounts(accs);
      setStatuses(stats);
      setHealth(h);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-open QR modal when WhatsApp flips to auth_required
  useEffect(() => {
    const api = window.browserAPI?.engine.whatsapp;
    if (!api) return;

    const unsub = api.onStatus(({ accountId, status }) => {
      if (status === 'auth_required') {
        setQrAccountId(accountId);
      } else if (status === 'authenticating' || status === 'connected' || status === 'disconnected') {
        // Refresh list so StatusBadge reflects the new state
        void load();
      }
    });

    return () => { unsub(); };
  }, [load]);

  // ── Add provider ─────────────────────────────────────────────────────────

  const handleAdd = useCallback(async (providerId: string) => {
    if (!window.browserAPI?.engine) return;
    setAdding(providerId);
    setAddError(null);
    let createdAccountId: string | null = null;
    try {
      let gmailAuth: Awaited<ReturnType<typeof executeOAuthFlow>> | null = null;
      if (providerId === 'gmail') {
        gmailAuth = await executeOAuthFlow('google');
        if (!gmailAuth.provider_tokens) {
          throw new Error('Google did not return Gmail API permission. Reconnect and approve Gmail read access.');
        }
      }

      const id = `${providerId}-${Date.now()}`;
      createdAccountId = id;
      await window.browserAPI.engine.accounts.add({
        id,
        provider: providerId,
        displayName: gmailAuth?.user.email || PROVIDER_META[providerId]?.label || providerId,
        email: gmailAuth?.user.email,
        gmailTokens: gmailAuth?.provider_tokens,
      });
      await load();

      // For WhatsApp, open the QR modal immediately after adding
      if (providerId === 'whatsapp') {
        setQrAccountId(id);
      }
    } catch (err) {
      console.error('[IntegrationsPanel] add error:', err);
      if (createdAccountId) {
        await window.browserAPI.engine.accounts.remove(createdAccountId).catch(() => {});
      }
      setAddError(err instanceof Error ? err.message : `Unable to connect ${providerId}.`);
    } finally {
      setAdding(null);
    }
  }, [load]);

  const handleGmailReconnect = useCallback(async (account: EngineAccountUI) => {
    setAdding(account.id);
    setAddError(null);
    try {
      const auth = await executeOAuthFlow('google');
      if (!auth.provider_tokens) {
        throw new Error('Google did not return Gmail API permission. Reconnect and approve Gmail read access.');
      }
      const gmailApi = window.browserAPI.engine.gmail;
      if (gmailApi?.applyTokens) {
        await gmailApi.applyTokens(account.id, auth.provider_tokens);
      } else {
        await window.browserAPI.engine.accounts.add({
          id: account.id,
          provider: 'gmail',
          displayName: auth.user.email || account.displayName,
          email: auth.user.email || account.email || undefined,
          gmailTokens: auth.provider_tokens,
        });
      }
      await load();
    } catch (err) {
      console.error('[IntegrationsPanel] Gmail reconnect error:', err);
      setAddError(err instanceof Error ? err.message : 'Unable to reconnect Gmail.');
    } finally {
      setAdding(null);
    }
  }, [load]);

  // ── Remove provider ───────────────────────────────────────────────────────

  const handleRemove = useCallback(async (accountId: string) => {
    if (!window.browserAPI?.engine) return;
    if (qrAccountId === accountId) setQrAccountId(null);
    await window.browserAPI.engine.accounts.remove(accountId);
    await load();
  }, [load, qrAccountId]);

  const handleReconnect = useCallback(async () => {
    await window.browserAPI?.engine.integrations.reconnectAll();
    setTimeout(load, 1_500);
  }, [load]);

  // ── Open QR for existing auth_required account ────────────────────────────

  const openQrFor = useCallback(async (accountId: string) => {
    setQrAccountId(accountId);
  }, []);

  // Providers not yet connected
  const connectedProviders  = new Set(accounts.map((a) => a.provider));
  const availableToAdd      = Object.keys(PROVIDER_META).filter((p) => !connectedProviders.has(p));

  return (
    <>
      <div className="space-y-8 max-w-2xl">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Integrations</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Connect services to receive unified notifications in Zyphora.
          </p>
          {addError && <p className="mt-2 text-xs text-red-400">{addError}</p>}
        </div>

        {/* Engine health */}
        {health && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${health.status === 'running' ? 'bg-green-400' : 'bg-[var(--text-faint)]'}`} />
              <span className="text-sm font-medium text-[var(--text)]">
                Engine {health.status === 'running' ? 'running' : 'stopped'}
              </span>
            </div>
            <span className="text-xs text-[var(--text-faint)]">{health.connectedCount}/{health.totalIntegrations} connected</span>
            <span className="text-xs text-[var(--text-faint)]">{health.eventCount} events processed</span>
            {health.lastEventAt && (
              <span className="text-xs text-[var(--text-faint)]">
                Last event {Math.round((Date.now() - health.lastEventAt) / 1_000)}s ago
              </span>
            )}
            <button
              onClick={handleReconnect}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
            >
              <RefreshCw size={11} /> Reconnect all
            </button>
          </div>
        )}

        {/* Connected accounts */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-3">
            Connected
          </h3>

          {loading && !accounts.length && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-faint)] py-4">
              <RefreshCw size={14} className="animate-spin" /> Loading…
            </div>
          )}

          {!loading && accounts.length === 0 && (
            <p className="text-sm text-[var(--text-faint)] py-4">No integrations connected yet.</p>
          )}

          <div className="flex flex-col gap-2">
            {accounts.map((account) => {
              const meta  = PROVIDER_META[account.provider];
              const state = statuses.find((s) => s.accountId === account.id);
              const currentStatus = state?.status ?? 'disconnected';
              const isWhatsApp    = account.provider === 'whatsapp';
              const isGmail       = account.provider === 'gmail';
              const needsQr       = isWhatsApp && currentStatus === 'auth_required';
              const needsGmailAuth = isGmail && currentStatus === 'auth_required';

              return (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                >
                  {/* Provider icon */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
                    style={{ background: meta?.color ?? '#888' }}
                  >
                    {meta?.icon ?? <Bell size={16} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">
                      {account.displayName}
                      {account.email && (
                        <span className="ml-2 text-[var(--text-faint)] font-normal">{account.email}</span>
                      )}
                    </p>
                    <StatusBadge status={currentStatus} />
                    {state?.lastError && (
                      <p className="text-xs text-red-400 mt-0.5 truncate">{state.lastError.message}</p>
                    )}
                  </div>

                  {/* QR button — only shown while WhatsApp is waiting for a scan */}
                  {needsQr && (
                    <button
                      onClick={() => openQrFor(account.id)}
                      title="Show QR code"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/15 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/25 transition-colors shrink-0"
                    >
                      <QrCode size={12} /> Show QR
                    </button>
                  )}

                  {needsGmailAuth && (
                    <button
                      onClick={() => void handleGmailReconnect(account)}
                      disabled={adding === account.id}
                      title="Reconnect Gmail"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-xs font-medium hover:bg-red-500/25 disabled:opacity-50 transition-colors shrink-0"
                    >
                      <RefreshCw size={12} className={adding === account.id ? 'animate-spin' : ''} />
                      {adding === account.id ? 'Connecting…' : 'Reconnect'}
                    </button>
                  )}

                  {/* Disconnect */}
                  <button
                    onClick={() => handleRemove(account.id)}
                    title="Disconnect"
                    className="p-1.5 rounded-lg hover:bg-[var(--hover)] text-[var(--text-faint)] hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Available to add */}
        {availableToAdd.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-3">
              Add integration
            </h3>
            <div className="flex flex-col gap-2">
              {availableToAdd.map((providerId) => {
                const meta = PROVIDER_META[providerId];
                return (
                  <div
                    key={providerId}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 opacity-70"
                      style={{ background: meta?.color ?? '#888' }}
                    >
                      {meta?.icon ?? <Bell size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">{meta?.label ?? providerId}</p>
                      {meta?.description && (
                        <p className="text-xs text-[var(--text-faint)] mt-0.5">{meta.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAdd(providerId)}
                      disabled={adding === providerId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                    >
                      {adding === providerId
                        ? <><RefreshCw size={11} className="animate-spin" /> Connecting…</>
                        : <><Plus size={11} /> Connect</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-xs text-[var(--text-faint)] leading-relaxed">
          All notifications are processed locally. Credentials are stored securely
          on this device and are never sent to Zyphora servers.
        </p>
      </div>

      {/* QR modal — rendered outside the scrollable panel so it overlays everything */}
      {qrAccountId && (
        <QRModal
          accountId={qrAccountId}
          onClose={() => { setQrAccountId(null); void load(); }}
        />
      )}
    </>
  );
};
