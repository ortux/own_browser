/**
 * startupPolicy.ts — privacy policies that Chromium only accepts as
 * command-line switches at process start.
 *
 * Because the renderer owns settings persistence, the current values are
 * mirrored to a small JSON file in userData that main reads BEFORE app ready.
 * The renderer pushes updates through the security-settings IPC; changes take
 * effect on the next launch (the settings UI says so).
 */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export type WebrtcPolicy = 'default' | 'public-only' | 'disable';

export interface StartupPolicy {
  /**
   * WebRTC IP handling. 'public-only' stops WebRTC from exposing LAN IPs and
   * — crucially for a proxy browser — from bypassing the proxy with direct
   * UDP candidates ('disable' = disable_non_proxied_udp, even stricter).
   */
  webrtcPolicy: WebrtcPolicy;
  /** Block third-party cookies (Chromium third-party storage partitioning). */
  blockThirdPartyCookies: boolean;
}

const POLICY_FILENAME = 'startup-policy.json';

function policyPath(): string {
  return path.join(app.getPath('userData'), POLICY_FILENAME);
}

function isWebrtcPolicy(value: unknown): value is WebrtcPolicy {
  return value === 'default' || value === 'public-only' || value === 'disable';
}

/**
 * Read the persisted policy. Defaults are the privacy-safe choices:
 * WebRTC limited to the public interface, third-party cookies blocked.
 */
export function readStartupPolicy(): StartupPolicy {
  try {
    const raw = fs.readFileSync(policyPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StartupPolicy>;
    return {
      webrtcPolicy: isWebrtcPolicy(parsed.webrtcPolicy) ? parsed.webrtcPolicy : 'public-only',
      blockThirdPartyCookies:
        typeof parsed.blockThirdPartyCookies === 'boolean'
          ? parsed.blockThirdPartyCookies
          : true,
    };
  } catch {
    return { webrtcPolicy: 'public-only', blockThirdPartyCookies: true };
  }
}

export function writeStartupPolicy(policy: Partial<StartupPolicy>): StartupPolicy {
  const next: StartupPolicy = { ...readStartupPolicy(), ...policy };
  try {
    fs.mkdirSync(path.dirname(policyPath()), { recursive: true });
    fs.writeFileSync(policyPath(), JSON.stringify(next, null, 2));
  } catch (error) {
    console.warn('[startup-policy] could not persist policy:', error);
  }
  return next;
}

/** Apply the persisted policy as Chromium switches. Call before app ready. */
export function applyStartupPolicyCommandLine(): StartupPolicy {
  const policy = readStartupPolicy();
  const webrtcValue =
    policy.webrtcPolicy === 'disable'
      ? 'disable_non_proxied_udp'
      : policy.webrtcPolicy === 'public-only'
        ? 'default_public_interface_only'
        : 'default';
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', webrtcValue);
  if (policy.blockThirdPartyCookies) {
    app.commandLine.appendSwitch('test-third-party-cookie-phaseout');
  }
  return policy;
}
