import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AdBlockEngine } from './AdBlockEngine';
import { parseRule, parseRules } from './RuleParser';
import { isThirdParty } from '../matching/ThirdPartyMatcher';
import { extractYouTubeVideoId } from '../../renderer/lib/sponsorBlock';
import { isAllowedNavigationUrl, normalizeNavigationUrl } from '../../shared/navigation';

function request(overrides: Partial<Parameters<AdBlockEngine['checkRequest']>[0]> = {}) {
  return {
    url: 'https://ads.example.net/script.js',
    sourceUrl: 'https://news.example.com/article',
    sourceDomain: 'news.example.com',
    destinationDomain: 'ads.example.net',
    resourceType: 'script' as const,
    isThirdParty: true,
    isMainFrame: false,
    ...overrides,
  };
}

test('blocks anchored domain rules', () => {
  const engine = new AdBlockEngine();
  engine.addRules([parseRule('||example.net^')!]);
  assert.equal(engine.checkRequest(request()).action, 'BLOCK');
});

test('exceptions override ordinary rules', () => {
  const engine = new AdBlockEngine();
  engine.addRules([parseRule('||example.net^')!, parseRule('@@||example.net^')!]);
  assert.equal(engine.checkRequest(request({
    sourceDomain: 'news.example.net',
    sourceUrl: 'https://news.example.net/article',
  })).action, 'ALLOW');
});

test('resource and third-party modifiers are enforced', () => {
  const engine = new AdBlockEngine();
  engine.addRules([parseRule('||example.net^$image,third-party')!]);
  assert.equal(engine.checkRequest(request({ resourceType: 'script' })).action, 'ALLOW');
  assert.equal(engine.checkRequest(request({ resourceType: 'image' })).action, 'BLOCK');
});

test('allowlist applies to subdomains', () => {
  const engine = new AdBlockEngine();
  engine.addRules([parseRule('||example.net^')!]);
  engine.addAllowlist('example.net');
  assert.equal(engine.checkRequest(request({
    sourceDomain: 'news.example.net',
    sourceUrl: 'https://news.example.net/article',
  })).action, 'ALLOW');
});

test('third-party detection uses registrable domains', () => {
  assert.equal(isThirdParty('news.example.com', 'cdn.example.com'), false);
  assert.equal(isThirdParty('news.example.com', 'ads.other.test'), true);
  assert.equal(isThirdParty('news.example.co.uk', 'cdn.other.co.uk'), true);
  assert.equal(isThirdParty('news.example.co.uk', 'cdn.example.co.uk'), false);
});

test('regex flags and separator syntax are supported safely', () => {
  const regex = parseRule('/ADSERVER/i');
  assert.equal(regex?.regexFlags, 'i');
  const regexEngine = new AdBlockEngine();
  regexEngine.addRules([regex!]);
  assert.equal(regexEngine.checkRequest(request({ url: 'https://cdn.test/adserver.js' })).action, 'BLOCK');

  const separatorEngine = new AdBlockEngine();
  separatorEngine.addRules([parseRule('ads^')!]);
  assert.equal(separatorEngine.checkRequest(request({ url: 'https://cdn.test/ads.js' })).action, 'BLOCK');
  assert.equal(separatorEngine.checkRequest(request({ url: 'https://cdn.test/adsx.js' })).action, 'ALLOW');
});

test('unsafe or malformed regex rules are ignored', () => {
  assert.equal(parseRule('/(a+)+/'), null);
  assert.equal(parseRule('/[invalid/'), null);
  assert.equal(parseRule('/ads/z'), null);
  assert.ok(parseRule('/^139\\.45\\.197\\./'));
});

test('badfilter disables its matching rule', () => {
  const rules = parseRules('||ads.example^\n||ads.example^$badfilter');
  assert.equal(rules.length, 0);
});

test('loads the supplied local filter list', async () => {
  const text = await fs.readFile('filter.txt', 'utf8');
  const rules = text.split(/\r?\n/).map(parseRule).filter(Boolean);
  assert.ok(rules.length > 10000);
});

test('extracts YouTube video IDs without sending non-YouTube URLs', () => {
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=abc123'), 'abc123');
  assert.equal(extractYouTubeVideoId('https://youtu.be/xyz789?t=4'), 'xyz789');
  assert.equal(extractYouTubeVideoId('https://example.com/watch?v=abc123'), null);
});

test('does not persist Chromium error pages as tab URLs', () => {
  assert.equal(isAllowedNavigationUrl('https://example.com/'), true);
  assert.equal(isAllowedNavigationUrl('chrome-error://chromewebdata/'), false);
  assert.equal(isAllowedNavigationUrl('javascript:alert(1)'), false);
  assert.equal(normalizeNavigationUrl('example.com'), 'https://example.com');
  assert.equal(normalizeNavigationUrl('localhost:3000'), 'https://localhost:3000');
  assert.equal(normalizeNavigationUrl('data:text/html,broken'), null);
});
