import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Search, Trash2, X, Copy, Eye, EyeOff, Check } from 'lucide-react';
import type { SavedPassword } from '../../shared/types';

interface PasswordsPanelProps {
  onClose: () => void;
  onAutofill?: (username: string, password: string) => void;
}

export const PasswordsPanel: React.FC<PasswordsPanelProps> = ({ onClose, onAutofill }) => {
  const [entries, setEntries]   = useState<SavedPassword[]>([]);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [copied, setCopied]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    if (!window.browserAPI) return;
    setLoading(true);
    setError(null);
    try {
      const data = q?.trim()
        ? await window.browserAPI.passwords.search(q.trim())
        : await window.browserAPI.passwords.getAll();
      setEntries(data);
    } catch (err) {
      console.error('[passwords] failed to load entries:', err);
      setError('Could not load saved passwords.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search so each keystroke does not hit the database.
  useEffect(() => {
    const id = setTimeout(() => { void load(query); }, query ? 180 : 0);
    return () => clearTimeout(id);
  }, [query, load]);

  const handleDelete = useCallback(async (entry: SavedPassword) => {
    if (!window.confirm(`Delete the saved password for ${entry.username}?`)) return;
    try {
      await window.browserAPI?.passwords.delete(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setRevealed((prev) => { const n = { ...prev }; delete n[entry.id]; return n; });
    } catch (err) {
      console.error('[passwords] failed to delete entry:', err);
      setError('Could not delete that entry.');
    }
  }, []);

  const handleReveal = useCallback(async (entry: SavedPassword) => {
    if (revealed[entry.id] !== undefined) {
      setRevealed((prev) => { const n = { ...prev }; delete n[entry.id]; return n; });
      return;
    }
    try {
      const full = await window.browserAPI?.passwords.getById(entry.id);
      if (full?.password) {
        setRevealed((prev) => ({ ...prev, [entry.id]: full.password as string }));
      } else {
        setError('This password could not be decrypted on this device.');
      }
    } catch (err) {
      console.error('[passwords] failed to reveal entry:', err);
      setError('Could not read that password.');
    }
  }, [revealed]);

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch (err) {
      console.error('[passwords] clipboard write failed:', err);
      setError('Clipboard is unavailable.');
    }
  }, []);

  /** Copy a password without revealing it on screen first. */
  const handleCopyPassword = useCallback(async (entry: SavedPassword) => {
    const secret = revealed[entry.id]
      ?? (await window.browserAPI?.passwords.getById(entry.id))?.password;
    if (!secret) { setError('Could not read that password.'); return; }
    await handleCopy(secret, `p-${entry.id}`);
  }, [revealed, handleCopy]);

  const handleAutofill = useCallback(async (entry: SavedPassword) => {
    if (!onAutofill) return;
    try {
      const full = await window.browserAPI?.passwords.getById(entry.id);
      if (!full?.password) { setError('Could not read that password.'); return; }
      onAutofill(entry.username, full.password);
      onClose();
    } catch (err) {
      console.error('[passwords] autofill failed:', err);
      setError('Could not fill that credential.');
    }
  }, [onAutofill, onClose]);

  // Group by hostname
  const grouped = entries.reduce<Record<string, SavedPassword[]>>((acc, e) => {
    let host = e.origin;
    try { host = new URL(e.origin).hostname; } catch { /* keep raw */ }
    (acc[host] = acc[host] ?? []).push(e);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border-l border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2 text-[var(--text)]">
          <KeyRound size={15} />
          <span className="text-sm font-semibold">Saved Passwords</span>
          {entries.length > 0 && (
            <span className="text-xs text-[var(--text-faint)]">({entries.length})</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--chrome)] border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
          <Search size={13} className="text-[var(--text-faint)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search passwords…"
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[var(--text-faint)] hover:text-[var(--text)]">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 shrink-0">
          {error}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading && (
          <p className="text-center py-8 text-xs text-[var(--text-faint)]">Loading…</p>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <KeyRound size={32} className="text-[var(--text-faint)] opacity-30" />
            <p className="text-sm text-[var(--text-faint)]">
              {query ? 'No results' : 'No saved passwords yet'}
            </p>
            {!query && (
              <p className="text-xs text-[var(--text-faint)] max-w-[180px] leading-relaxed">
                Passwords are saved automatically when you log in to a site.
              </p>
            )}
          </div>
        )}

        {Object.entries(grouped).map(([host, creds]) => (
          <div key={host} className="mb-4">
            {/* Site label */}
            <div className="flex items-center gap-2 px-2 pb-1 mb-0.5">
              {creds[0].favicon
                ? <img src={creds[0].favicon} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <KeyRound size={11} className="text-[var(--text-faint)] shrink-0" />
              }
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] truncate">
                {host}
              </span>
            </div>

            {creds.map((entry) => (
              <div
                key={entry.id}
                className="group mb-1 rounded-xl border border-[var(--border)] bg-[var(--chrome)] px-3 py-2.5 hover:border-[var(--border-strong)] transition-colors"
              >
                {/* Username row */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex-1 text-sm text-[var(--text)] truncate font-medium">
                    {entry.username}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleCopy(entry.username, `u-${entry.id}`)}
                      title="Copy username"
                      className="p-1 rounded hover:bg-[var(--hover)] text-[var(--text-faint)]"
                    >
                      {copied === `u-${entry.id}`
                        ? <Check size={12} className="text-green-400" />
                        : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Password row */}
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-[var(--text-muted)] font-mono truncate tracking-wider">
                    {revealed[entry.id] ?? '••••••••'}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleReveal(entry)}
                      title={revealed[entry.id] ? 'Hide password' : 'Reveal password'}
                      className="p-1 rounded hover:bg-[var(--hover)] text-[var(--text-faint)]"
                    >
                      {revealed[entry.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      onClick={() => { void handleCopyPassword(entry); }}
                      title="Copy password"
                      className="p-1 rounded hover:bg-[var(--hover)] text-[var(--text-faint)]"
                    >
                      {copied === `p-${entry.id}`
                        ? <Check size={12} className="text-green-400" />
                        : <Copy size={12} />}
                    </button>
                    {onAutofill && (
                      <button
                        onClick={() => handleAutofill(entry)}
                        title="Autofill on page"
                        className="p-1 rounded hover:bg-[var(--hover)] text-[var(--accent)]"
                      >
                        <Check size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => { void handleDelete(entry); }}
                      title="Delete"
                      className="p-1 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <p className="mt-1 text-[10px] text-[var(--text-faint)]">
                  Saved {new Date(entry.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
