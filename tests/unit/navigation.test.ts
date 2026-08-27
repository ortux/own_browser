import { describe, it, expect } from 'vitest';
import {
  isAllowedNavigationUrl,
  normalizeNavigationUrl,
  isHttpNavigationUrl,
  looksLikeUrl,
  isExternalProtocolUrl,
  isInternalPageUrl,
  internalPageTitle,
} from '../../src/shared/navigation';

describe('isAllowedNavigationUrl', () => {
  it('accepts http, https and file URLs with a host', () => {
    expect(isAllowedNavigationUrl('https://example.com/')).toBe(true);
    expect(isAllowedNavigationUrl('http://example.com:8080/path?q=1')).toBe(true);
    expect(isAllowedNavigationUrl('file:///home/user/doc.html')).toBe(true);
  });

  it('accepts about:blank and known internal pages only', () => {
    expect(isAllowedNavigationUrl('about:blank')).toBe(true);
    expect(isAllowedNavigationUrl('zyphora://downloads')).toBe(true);
    expect(isAllowedNavigationUrl('zyphora://history')).toBe(true);
    expect(isAllowedNavigationUrl('zyphora://unknown')).toBe(false);
  });

  it('rejects internal Chromium error and script URLs', () => {
    expect(isAllowedNavigationUrl('chrome-error://chromewebdata/')).toBe(false);
    expect(isAllowedNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedNavigationUrl('data:text/html,broken')).toBe(false);
  });
});

describe('normalizeNavigationUrl', () => {
  it('upgrades bare domains to https', () => {
    expect(normalizeNavigationUrl('example.com')).toBe('https://example.com');
    expect(normalizeNavigationUrl('sub.example.co.uk/x')).toBe('https://sub.example.co.uk/x');
  });

  it('keeps host:port values intact', () => {
    expect(normalizeNavigationUrl('localhost:3000')).toBe('https://localhost:3000');
    expect(normalizeNavigationUrl('example.com:8443')).toBe('https://example.com:8443');
  });

  it('never turns dangerous schemes into URLs', () => {
    expect(normalizeNavigationUrl('data:text/html,broken')).toBeNull();
    expect(normalizeNavigationUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeNavigationUrl('chrome-error://chromewebdata/')).toBeNull();
  });

  it('returns already-valid URLs unchanged', () => {
    expect(normalizeNavigationUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeNavigationUrl('http://192.168.1.1')).toBe('http://192.168.1.1');
  });
});

describe('isHttpNavigationUrl', () => {
  it('is true only for http(s) with a hostname', () => {
    expect(isHttpNavigationUrl('https://a.com')).toBe(true);
    expect(isHttpNavigationUrl('http://a.com')).toBe(true);
    expect(isHttpNavigationUrl('ftp://a.com')).toBe(false);
    expect(isHttpNavigationUrl('not a url')).toBe(false);
  });
});

describe('looksLikeUrl', () => {
  it('detects scheme-prefixed and localhost inputs', () => {
    expect(looksLikeUrl('https://example.com')).toBe(true);
    expect(looksLikeUrl('file:///x')).toBe(true);
    expect(looksLikeUrl('zyphora://downloads')).toBe(true);
    expect(looksLikeUrl('localhost:3000')).toBe(true);
  });

  it('treats dotted single-token input as a URL and sentences as searches', () => {
    expect(looksLikeUrl('example.com')).toBe(true);
    expect(looksLikeUrl('how do magnets work')).toBe(false);
    expect(looksLikeUrl('192.168.1.1')).toBe(true);
  });
});

describe('external protocols', () => {
  it('recognises OS-handled schemes', () => {
    expect(isExternalProtocolUrl('mailto:someone@example.com')).toBe(true);
    expect(isExternalProtocolUrl('tel:+15551234567')).toBe(true);
    expect(isExternalProtocolUrl('MAILTO:x@y.z')).toBe(true);
    expect(isExternalProtocolUrl('magnet:?xt=urn:btih:abc')).toBe(true);
  });

  it('does not flag web or internal schemes', () => {
    expect(isExternalProtocolUrl('https://example.com')).toBe(false);
    expect(isExternalProtocolUrl('zyphora://downloads')).toBe(false);
    expect(isExternalProtocolUrl('example.com')).toBe(false);
  });
});

describe('internal pages', () => {
  it('identifies pages and their titles', () => {
    expect(isInternalPageUrl('zyphora://downloads')).toBe(true);
    expect(isInternalPageUrl('zyphora://diagnostics')).toBe(true);
    expect(isInternalPageUrl('https://example.com')).toBe(false);
    expect(internalPageTitle('zyphora://downloads')).toBe('Downloads');
    expect(internalPageTitle('zyphora://history')).toBe('History');
    expect(internalPageTitle('https://example.com')).toBeNull();
  });
});
