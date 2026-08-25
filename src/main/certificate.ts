/**
 * Certificate monitor — captures the TLS server certificate of visited sites so
 * the UI can show a security shield (green = valid, red = missing/invalid).
 *
 * Security: we only OBSERVE certificates. Verification is deferred to Electron's
 * built-in engine (`callback(-3)`), so we never weaken TLS validation. Invalid
 * certificates still fail the load as usual; we just record the details.
 */

import { session, app } from 'electron';

export interface CertInfo {
  present: boolean;
  valid: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: string; // ISO string
  validTo?: string; // ISO string
  serialNumber?: string;
  fingerprint?: string;
  error?: string;
}

const certByHost = new Map<string, CertInfo>();

function toIso(seconds?: number): string | undefined {
  return typeof seconds === 'number' && !Number.isNaN(seconds)
    ? new Date(seconds * 1000).toISOString()
    : undefined;
}

export function initCertificateMonitor(): void {
  // Called for every TLS connection. We record the cert + validity and then
  // defer to Chromium's default verification (we do NOT override it).
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    try {
      const { hostname, certificate, errorCode } = request;
      if (hostname && certificate) {
        certByHost.set(hostname.toLowerCase(), {
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

  // Fired when a certificate fails validation — record it as invalid.
  app.on('certificate-error', (_event, _webContents, url, error, certificate) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      certByHost.set(host, {
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
