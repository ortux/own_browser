import React, { useEffect, useRef } from 'react';
import { KeyRound, X, Check } from 'lucide-react';

interface SavePasswordPromptProps {
  origin: string;
  username: string;
  password: string;
  title: string;
  favicon?: string;
  onSave: () => void;
  onDismiss: () => void;
}

export const SavePasswordPrompt: React.FC<SavePasswordPromptProps> = ({
  origin,
  username,
  favicon,
  onSave,
  onDismiss,
}) => {
  const saveRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the Save button so Enter key works immediately
  useEffect(() => {
    saveRef.current?.focus();
  }, []);

  // Parse display hostname from origin
  let host = origin;
  try {
    host = new URL(origin).hostname;
  } catch {
    /* keep raw */
  }

  return (
    <div
      className="animate-overlay-in flex w-full max-w-sm items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
      style={{ boxShadow: 'var(--shadow-overlay)' }}
    >
      {/* Icon / favicon */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center overflow-hidden">
        {favicon ? (
          <img
            src={favicon}
            alt=""
            className="w-5 h-5 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <KeyRound size={16} className="text-[var(--accent-fg)]" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text)] truncate">Save password?</p>
        <p className="text-xs text-[var(--text-muted)] truncate">
          {username} · {host}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          ref={saveRef}
          onClick={onSave}
          title="Save"
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--accent-text)] text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          <Check size={13} /> Save
        </button>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="p-1.5 rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
