import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AdBlockEngine } from './AdBlockEngine';
import { parseRule } from './RuleParser';
import { isThirdParty } from '../matching/ThirdPartyMatcher';
import { extractYouTubeVideoId } from '../../renderer/lib/sponsorBlock';

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
});

test('unsafe or malformed regex rules are ignored', () => {
  assert.equal(parseRule('/(a+)+/'), null);
  assert.equal(parseRule('/[invalid/'), null);
  assert.ok(parseRule('/^139\\.45\\.197\\./'));
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
