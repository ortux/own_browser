/**
 * Certificate monitor — captures the TLS server certificate of visited sites so
 * the UI can show a security shield (green = valid, red = missing/invalid).
 *
 * Security: we only OBSERVE certificates. Verification is deferred to Electron's
 * built-in engine (`callback(-3)`), so we never weaken TLS validation. Invalid
 * certificates still fail the load as usual; we just record the details.
 */

import { session, app } from 'electron';

import type { CertInfo } from '../shared/types';

export type { CertInfo };

/**
 * Cap the cert cache. A long browsing session touches thousands of hosts and
 * this map was never pruned, so it grew for the lifetime of the process.
 * Insertion order gives us a cheap FIFO eviction.
 */
const MAX_CERT_HOSTS = 500;
const certByHost = new Map<string, CertInfo>();

function rememberCert(hostname: string, info: CertInfo): void {
  // Re-inserting moves the host to the end, so active sites are evicted last.
  certByHost.delete(hostname);
  certByHost.set(hostname, info);
  while (certByHost.size > MAX_CERT_HOSTS) {
    const oldest = certByHost.keys().next();
    if (oldest.done) break;
    certByHost.delete(oldest.value);
  }
}

function toIso(seconds?: number): string | undefined {
  return typeof seconds === 'number' && !Number.isNaN(seconds)
    ? new Date(seconds * 1000).toISOString()
    : undefined;
}

const monitoredSessions = new WeakSet<Electron.Session>();

/**
 * Record certificates for one session.
 *
 * Every <webview> gets its own session (and private tabs get a `temp:`
 * partition), so watching only `defaultSession` meant the padlock reported
 * "unknown" for essentially every real page load. Call this for each managed
 * session as it appears.
 */
export function attachCertificateMonitorToSession(ses: Electron.Session): void {
  if (monitoredSessions.has(ses)) return;
  monitoredSessions.add(ses);

  // Called for every TLS connection. We record the cert + validity and then
  // defer to Chromium's default verification (we do NOT override it).
  ses.setCertificateVerifyProc((request, callback) => {
    try {
      const { hostname, certificate, errorCode } = request;
      if (hostname && certificate) {
        rememberCert(hostname.toLowerCase(), {
          present: true,
          valid: errorCode === 0,
          issuer: certificate.issuerName,
          subject: certificate.subjectName,
          validFrom: toIso(certificate.validStart),
          validTo: toIso(certificate.validExpiry),
          serialNumber: certificate.serialNumber,
          fingerprint: certificate.fingerprint,
        });
      }
    } catch {
      /* ignore */
    }
    // -3 = defer to the default built-in verification.
    callback(-3);
  });
}

export function initCertificateMonitor(): void {
  attachCertificateMonitorToSession(session.defaultSession);

  // Fired when a certificate fails validation — record it as invalid.
  app.on('certificate-error', (_event, _webContents, url, error, certificate) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      rememberCert(host, {
        present: true,
        valid: false,
        issuer: certificate?.issuerName,
        subject: certificate?.subjectName,
        validFrom: toIso(certificate?.validStart),
        validTo: toIso(certificate?.validExpiry),
        serialNumber: certificate?.serialNumber,
        fingerprint: certificate?.fingerprint,
        error,
      });
    } catch {
      /* ignore */
    }
  });
}

export function getCertInfo(hostname: string): CertInfo | null {
  if (!hostname) return null;
  return certByHost.get(hostname.toLowerCase()) ?? null;
}
