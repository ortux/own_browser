import React, { useState } from 'react';

interface DeviceNameScreenProps {
  onNext: (deviceName: string) => void;
}

export const DeviceNameScreen: React.FC<DeviceNameScreenProps> = ({ onNext }) => {
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
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

    onNext(trimmed);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-8 backdrop-blur-lg shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">📱</span>
            <h1 className="text-2xl font-bold text-white">Name This Device</h1>
          </div>

          <p className="mb-8 text-sm text-slate-400">
            Give your device a memorable name so you can identify it across your account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="deviceName" className="mb-2 block font-mono text-xs uppercase tracking-wider text-slate-400">
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
                placeholder="e.g., Work Laptop, Desktop PC, MacBook"
                maxLength={64}
                className="w-full rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                autoFocus
              />
              <div className="mt-1 text-right text-xs text-slate-500">
                {deviceName.length}/64
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="mt-6 w-full rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 font-semibold text-white transition hover:from-violet-500 hover:to-cyan-500 active:scale-95"
            >
              Continue
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            You can change this later in settings.
          </p>
        </div>
      </div>
    </div>
  );
};
