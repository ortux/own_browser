import React, { useState, useEffect } from 'react';
import { Smartphone, Laptop, Tablet, Trash2, Edit2, Clock, Loader } from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { useSettingsStore } from '../stores/settingsStore';

interface Device {
  id: number;
  device_key: string;
  name: string;
  last_seen_at: string;
}

interface DevicesPageProps {
  onBack: () => void;
}

function getDeviceIcon(name: string): React.ElementType {
  const lower = name.toLowerCase();
  if (lower.includes('mobile') || lower.includes('phone')) return Smartphone;
  if (lower.includes('tablet')) return Tablet;
  return Laptop;
}

function formatLastSeen(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export const DevicesPage: React.FC<DevicesPageProps> = ({ onBack }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const { deviceName } = useSettingsStore();

  // Load devices on mount
  useEffect(() => {
    loadDevices();
    // Refresh every 30 seconds
    const interval = setInterval(loadDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get<{ devices: Device[] }>('/api/v1/devices', {
        requireAuth: true,
      });

      if (response.ok && response.data?.devices) {
        setDevices(response.data.devices);
      } else {
        setError(response.error || 'Failed to load devices');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (deviceId: number) => {
    if (!newName.trim()) return;

    try {
      const response = await apiClient.put(
        `/api/v1/devices/${deviceId}`,
        { name: newName.trim() },
        { requireAuth: true }
      );

      if (response.ok) {
        setDevices(devices.map((d) => (d.id === deviceId ? { ...d, name: newName.trim() } : d)));
        setRenaming(null);
        setNewName('');
      } else {
        setError(response.error || 'Failed to rename device');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename device');
    }
  };

  const handleDelete = async (deviceId: number) => {
    if (!confirm('Are you sure you want to unlink this device?')) return;

    try {
      const response = await apiClient.delete(`/api/v1/devices/${deviceId}`, { requireAuth: true });

      if (response.ok) {
        setDevices(devices.filter((d) => d.id !== deviceId));
        setSelectedDevice(null);
      } else {
        setError(response.error || 'Failed to delete device');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete device');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Devices</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Manage devices synced to your Zyphora account
            </p>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded border border-[var(--border)] hover:bg-[var(--hover)] transition-colors"
          >
            Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader size={32} className="animate-spin text-[var(--accent-fg)]" />
              <p className="text-[var(--text-muted)]">Loading devices...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="m-6 p-4 bg-[var(--danger-soft)] border border-[var(--danger)]/40/50 rounded text-[var(--danger)]">
            {error}
          </div>
        )}

        {!loading && devices.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Smartphone size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-[var(--text-muted)]">No devices registered yet</p>
            </div>
          </div>
        )}

        {!loading && devices.length > 0 && (
          <div className="p-6 space-y-4">
            {devices.map((device) => {
              const Icon = getDeviceIcon(device.name);
              const isCurrentDevice = device.name === deviceName;
              const isRenaming = renaming === device.id;

              return (
                <div
                  key={device.id}
                  className={`border rounded-md p-4 transition-colors ${
                    selectedDevice === device.id
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                  }`}
                  onClick={() => setSelectedDevice(device.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="mt-1">
                        <Icon size={24} className="text-[var(--accent-fg)]" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <div className="flex gap-2 items-center">
                            <input
                              autoFocus
                              type="text"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              className="flex-1 px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(device.id);
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                            />
                            <button
                              onClick={() => handleRename(device.id)}
                              className="px-3 py-1 bg-[var(--accent)] text-[var(--bg)] rounded text-xs font-medium hover:opacity-90"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setRenaming(null)}
                              className="px-3 py-1 bg-[var(--border)] rounded text-xs font-medium hover:bg-[var(--hover)]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base">{device.name}</h3>
                              {isCurrentDevice && (
                                <span className="px-2 py-0.5 bg-[var(--accent)]/20 text-[var(--accent-fg)] text-xs font-medium rounded">
                                  This device
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-2 text-xs text-[var(--text-muted)]">
                              <Clock size={14} />
                              Last seen: {formatLastSeen(device.last_seen_at)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {!isRenaming && !isCurrentDevice && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => {
                            setRenaming(device.id);
                            setNewName(device.name);
                          }}
                          className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded transition-colors"
                          title="Rename device"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(device.id)}
                          className="p-2 text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded transition-colors"
                          title="Unlink device"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isRenaming && (
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      Enter a new name for this device
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer info */}
      {!loading && devices.length > 0 && (
        <div className="border-t border-[var(--border)] px-6 py-4 bg-[var(--surface)] text-sm text-[var(--text-muted)]">
          <p>
            You have <strong>{devices.length}</strong> device{devices.length !== 1 ? 's' : ''}{' '}
            synced to your account. Your browsing history, bookmarks, and settings are shared across
            all registered devices.
          </p>
        </div>
      )}
    </div>
  );
};
