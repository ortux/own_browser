import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDownload, resetDownloadCount, noteDownloadStarted } from './agentDownloads';

// These run against the default config (block risky downloads on, max 3 per
// task), which is what a fresh install has.

test('executables are blocked', () => {
  resetDownloadCount();
  for (const name of ['setup.exe', 'install.msi', 'run.sh', 'app.dmg', 'thing.apk', 'x.bat']) {
    const verdict = assessDownload(name, 'https://example.com/file');
    assert.equal(verdict.allowed, false, `${name} should be blocked`);
  }
});

test('a double extension cannot disguise an executable', () => {
  resetDownloadCount();
  // The classic trick: a file that reads as a PDF but runs as a program.
  assert.equal(assessDownload('invoice.pdf.exe', 'https://example.com').allowed, false);
  assert.equal(assessDownload('photo.jpg.scr', 'https://example.com').allowed, false);
});

test('a trailing dot cannot bypass the extension check', () => {
  resetDownloadCount();
  // Windows strips trailing dots when resolving a filename, so "evil.exe."
  // executes just the same.
  assert.equal(assessDownload('evil.exe.', 'https://example.com').allowed, false);
});

test('extension matching is case-insensitive', () => {
  resetDownloadCount();
  assert.equal(assessDownload('Setup.EXE', 'https://example.com').allowed, false);
});

test('ordinary documents download without fuss', () => {
  resetDownloadCount();
  for (const name of ['report.pdf', 'notes.txt', 'sheet.csv', 'photo.png']) {
    const verdict = assessDownload(name, 'https://example.com');
    assert.equal(verdict.allowed, true, `${name} should be allowed`);
    assert.equal(verdict.needsConfirmation, false);
  }
});

test('archives are allowed but ask first', () => {
  resetDownloadCount();
  // An archive can contain an executable, so it warrants a look but blocking
  // it outright would be too aggressive.
  const verdict = assessDownload('bundle.zip', 'https://example.com');
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.needsConfirmation, true);
});

test('the per-task download cap is enforced', () => {
  resetDownloadCount();
  for (let i = 0; i < 3; i++) {
    assert.equal(assessDownload('file.pdf', 'https://example.com').allowed, true);
    noteDownloadStarted();
  }
  const verdict = assessDownload('one-too-many.pdf', 'https://example.com');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /limit/i);
});

test('resetting the counter starts a fresh task', () => {
  resetDownloadCount();
  for (let i = 0; i < 3; i++) noteDownloadStarted();
  assert.equal(assessDownload('a.pdf', 'https://example.com').allowed, false);
  resetDownloadCount();
  assert.equal(assessDownload('a.pdf', 'https://example.com').allowed, true);
});

test('a file with no extension is not treated as executable', () => {
  resetDownloadCount();
  assert.equal(assessDownload('README', 'https://example.com').allowed, true);
});
