import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface DeviceNameModalProps {
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export const DeviceNameModal: React.FC<DeviceNameModalProps> = ({ onSubmit, onClose, isOpen }) => {
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = deviceName.trim();

    if (!trimmed) {
      setError('Please enter a device name.');
      return;
    }

    if (trimmed.length > 64) {
      setError('Device name must be 64 characters or less.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onSubmit(trimmed);
      setDeviceName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register device');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-modal-title"
        className="animate-overlay-in w-full max-w-sm rounded-md border border-[var(--border)] bg-[var(--surface)] p-6"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 id="device-modal-title" className="text-base font-semibold text-[var(--text)]">
            Name this device
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="-mr-1 -mt-0.5 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-[var(--text-muted)]">
          Used to identify this computer when syncing history and settings.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="deviceName"
            className="mb-1.5 block text-sm font-medium text-[var(--text)]"
          >
            Device name
          </label>
          <input
            id="deviceName"
            type="text"
            value={deviceName}
            onChange={(e) => {
              setDeviceName(e.target.value);
              setError('');
            }}
            placeholder="Work laptop"
            disabled={loading}
            maxLength={64}
            autoFocus
            aria-invalid={Boolean(error)}
            className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors focus:border-[var(--text-faint)] focus:outline-none disabled:opacity-50"
          />

          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !deviceName.trim()}
              className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Registering…' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
