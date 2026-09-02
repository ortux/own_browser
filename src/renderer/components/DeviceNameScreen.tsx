import React, { useState } from 'react';

interface DeviceNameScreenProps {
  onNext: (deviceName: string) => void;
}

const MAX_LENGTH = 64;

export const DeviceNameScreen: React.FC<DeviceNameScreenProps> = ({ onNext }) => {
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = deviceName.trim();

    if (!trimmed) {
      setError('Enter a name for this device.');
      return;
    }

    if (trimmed.length > MAX_LENGTH) {
      setError(`Device name must be ${MAX_LENGTH} characters or fewer.`);
      return;
    }

    onNext(trimmed);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
          Name this device
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Used to identify this computer in your device list. You can change it later in Settings.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
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
            maxLength={MAX_LENGTH}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'deviceName-error' : undefined}
            className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors focus:border-[var(--text-faint)] focus:outline-none"
            autoFocus
          />

          {error && (
            <p id="deviceName-error" className="mt-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-6 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};
