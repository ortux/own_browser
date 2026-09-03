/**
 * agentDownloads.ts — download safeguards for agent-initiated downloads.
 *
 * Separate from downloads.ts because these rules apply only while the agent is
 * driving. A person who clicks a .exe has decided to; an agent that was talked
 * into clicking one by a malicious page has not, and the user may not even be
 * at the keyboard.
 */

import { getAgentConfig, logActivity } from './agentConfigStore';
import { hostFromUrl } from '../shared/agentConfig';

/**
 * Extensions that can execute code on the user's machine.
 *
 * Matched against the final extension after stripping a trailing dot, so
 * "invoice.pdf.exe" is caught as an executable rather than trusted as a PDF.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'appx', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'hta',
  'jar', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'reg',
  'dll', 'sys', 'drv', 'ocx',
  'sh', 'bash', 'zsh', 'run', 'bin', 'deb', 'rpm', 'appimage',
  'app', 'dmg', 'pkg', 'command', 'osx',
  'apk', 'ipa',
  'lnk', 'url', 'inf', 'scf',
]);

/** Archives can hide the above, so they warrant a mention but not a block. */
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab']);

export interface DownloadVerdict {
  allowed: boolean;
  /** True when the user must approve before it proceeds. */
  needsConfirmation: boolean;
  reason: string;
}

function extensionOf(filename: string): string {
  const clean = filename.trim().replace(/\.+$/, '').toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1);
}

/** Per-run download counter, reset by resetDownloadCount(). */
let downloadsThisRun = 0;

export function resetDownloadCount(): void {
  downloadsThisRun = 0;
}

export function noteDownloadStarted(): void {
  downloadsThisRun++;
}

/**
 * Should this agent-initiated download be allowed?
 *
 * Errs toward blocking: the agent can always tell the user it could not
 * download something, which is a far better outcome than silently saving
 * malware to their Downloads folder.
 */
export function assessDownload(filename: string, url: string): DownloadVerdict {
  const config = getAgentConfig();
  const extension = extensionOf(filename);
  const domain = hostFromUrl(url);

  if (downloadsThisRun >= config.security.maxDownloadsPerTask) {
    return {
      allowed: false,
      needsConfirmation: false,
      reason: `The limit of ${config.security.maxDownloadsPerTask} downloads for one task has been reached.`,
    };
  }

  if (config.security.blockDangerousDownloads && EXECUTABLE_EXTENSIONS.has(extension)) {
    logActivity({
      domain: domain || 'unknown',
      action: `Blocked a download of ${filename}`,
      result: 'blocked',
      permission: 'never',
      detail: 'The file can run code on your computer.',
    });
    return {
      allowed: false,
      needsConfirmation: false,
      reason: `${filename} is a program, and "Block risky downloads" is on. Download it yourself if you are sure.`,
    };
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return {
      allowed: true,
      needsConfirmation: true,
      reason: `${filename} is an archive, which could contain anything. Save it?`,
    };
  }

  return { allowed: true, needsConfirmation: false, reason: '' };
}

/** Would the agent be permitted to open this downloaded file? */
export function canOpenDownload(): { allowed: boolean; needsConfirmation: boolean } {
  const config = getAgentConfig();
  // Opening a file hands control to whatever program the OS associates with
  // it, so this is deliberately always gated when the setting is on.
  return { allowed: true, needsConfirmation: config.security.confirmOpeningDownloads };
}
