import assert from 'node:assert/strict';
import test from 'node:test';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import { isAllowedNavigationUrl, normalizeNavigationUrl } from '../shared/navigation';

function request(overrides: Partial<Parameters<typeof Request.fromRawDetails>[0]> = {}) {
  return Request.fromRawDetails({
    requestId: 'test-request',
    tabId: 1,
    url: 'https://ads.example/script.js',
    sourceUrl: 'https://news.example/article',
    type: 'script',
    ...overrides,
  });
}

test('Ghostery blocks an ad resource', () => {
  const engine = FiltersEngine.parse('||ads.example^');
  assert.equal(engine.match(request()).match, true);
});

test('Ghostery exceptions override an ad rule', () => {
  const engine = FiltersEngine.parse('||ads.example^\n@@||ads.example/allowed.js');
  assert.equal(engine.match(request()).match, true);
  assert.equal(engine.match(request({ url: 'https://ads.example/allowed.js' })).match, false);
});

test('ordinary content is allowed', () => {
  const engine = FiltersEngine.parse('||ads.example^');
  assert.equal(
    engine.match(
      request({
        url: 'https://cdn.example.org/app.js',
        sourceUrl: 'https://news.example/article',
      })
    ).match,
    false
  );
});

test('browser navigation rejects internal error and script URLs', () => {
  assert.equal(isAllowedNavigationUrl('https://example.com/'), true);
  assert.equal(isAllowedNavigationUrl('chrome-error://chromewebdata/'), false);
  assert.equal(isAllowedNavigationUrl('javascript:alert(1)'), false);
  assert.equal(normalizeNavigationUrl('example.com'), 'https://example.com');
  assert.equal(normalizeNavigationUrl('localhost:3000'), 'https://localhost:3000');
  assert.equal(normalizeNavigationUrl('data:text/html,broken'), null);
});
