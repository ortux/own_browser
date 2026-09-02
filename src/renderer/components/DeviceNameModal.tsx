import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface DeviceNameModalProps {
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export const DeviceNameModal: React.FC<DeviceNameModalProps> = ({
  onSubmit,
  onClose,
  isOpen,
}) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111315] p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Name This Device</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 hover:bg-white/10 disabled:opacity-50"
          >
            <X size={20} className="text-white" />
          </button>
        </div>

        <p className="mb-6 text-sm text-zinc-400">
          Give your device a memorable name so you can identify it when syncing browsing history and settings.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="deviceName" className="mb-2 block font-mono text-xs uppercase tracking-wider text-zinc-500">
              Device Name
            </label>
            <input
              id="deviceName"
              type="text"
              value={deviceName}
              onChange={(e) => {
                setDeviceName(e.target.value);
                setError('');
              }}
              placeholder="e.g., My MacBook Pro"
              disabled={loading}
              className="w-full rounded-lg border border-white/10 bg-[#090a0b] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#c9f36b] focus:outline-none focus:ring-2 focus:ring-[#c9f36b]/20 disabled:opacity-50"
              maxLength={64}
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-zinc-600">{deviceName.length}/64 characters</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !deviceName.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#c9f36b] px-4 py-2.5 text-sm font-medium text-[#090a0b] transition hover:bg-[#b8e05c] disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Registering...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
