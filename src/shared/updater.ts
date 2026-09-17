export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'up_to_date'
  | 'error';

export type ReleaseChannel = 'stable' | 'beta' | 'dev';

export interface UpdateInfo {
  state: UpdateState;
  currentVersion: string;
  channel: ReleaseChannel;
  availableVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  downloadProgress?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  errorCode?: string;
  errorMessage?: string;
  canInstall?: boolean;
}

export const UPDATE_STATES: readonly UpdateState[] = [
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'installing',
  'up_to_date',
  'error',
];

export function parseReleaseChannel(value: unknown): ReleaseChannel {
  return value === 'beta' || value === 'dev' ? value : 'stable';
}

/** Compare numeric dotted versions, ignoring prerelease metadata. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .split(/[+-]/, 1)[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function initialUpdateInfo(currentVersion: string, channel: ReleaseChannel): UpdateInfo {
  return { state: 'idle', currentVersion, channel };
}

export function userFacingUpdateError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  if (lower.includes('net::') || lower.includes('network') || lower.includes('enotfound')) {
    return { code: 'NETWORK_UNAVAILABLE', message: 'The update server is unavailable. Try again later.' };
  }
  if (lower.includes('signature') || lower.includes('sha512') || lower.includes('checksum')) {
    return { code: 'VERIFICATION_FAILED', message: 'The downloaded update could not be verified.' };
  }
  if (lower.includes('space')) {
    return { code: 'INSUFFICIENT_DISK_SPACE', message: 'There is not enough disk space to stage the update.' };
  }
  return { code: 'UPDATE_FAILED', message: 'Zyphora could not complete the update. You can keep browsing and try again.' };
}
