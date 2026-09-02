import assert from 'node:assert/strict';
import test from 'node:test';
import { stripTrackingParams, isTrackingParam } from './trackingParams';

test('campaign parameters are removed', () => {
  assert.equal(
    stripTrackingParams('https://example.com/page?utm_source=x&utm_medium=y'),
    'https://example.com/page'
  );
});

test('click identifiers are removed', () => {
  for (const param of ['gclid', 'fbclid', 'msclkid', 'igshid', 'twclid', 'mc_eid']) {
    assert.equal(
      stripTrackingParams(`https://example.com/?${param}=abc123`),
      'https://example.com/',
      `${param} should be stripped`
    );
  }
});

test('real query parameters are preserved', () => {
  assert.equal(
    stripTrackingParams('https://example.com/search?q=privacy&utm_source=news&page=2'),
    'https://example.com/search?q=privacy&page=2'
  );
});

test('a URL with nothing to strip is returned unchanged', () => {
  const url = 'https://example.com/search?q=hello&page=2';
  assert.equal(stripTrackingParams(url), url);
});

test('stripping every parameter also removes the question mark', () => {
  assert.equal(
    stripTrackingParams('https://example.com/article?utm_source=a'),
    'https://example.com/article',
    'a dangling ? would be ugly in the address bar'
  );
});

test('fragments and paths survive', () => {
  assert.equal(
    stripTrackingParams('https://example.com/docs/guide?utm_campaign=x#section-3'),
    'https://example.com/docs/guide#section-3'
  );
});

test('prefix families are covered', () => {
  assert.ok(isTrackingParam('utm_anything_new'));
  assert.ok(isTrackingParam('pk_campaign'));
  assert.ok(isTrackingParam('matomo_keyword'));
  assert.ok(!isTrackingParam('q'));
  assert.ok(!isTrackingParam('page'));
  assert.ok(!isTrackingParam('id'));
});

test('parameter matching is case-insensitive', () => {
  assert.equal(stripTrackingParams('https://example.com/?UTM_Source=x'), 'https://example.com/');
});

test('non-http schemes are left alone', () => {
  // These never reach a webview anyway, but the helper must not mangle them.
  for (const url of ['mailto:a@b.com?utm_source=x', 'about:blank']) {
    assert.equal(stripTrackingParams(url), url);
  }
});

test('unparseable input is returned as-is', () => {
  assert.equal(stripTrackingParams('not a url'), 'not a url');
  assert.equal(stripTrackingParams(''), '');
});

test('allowlisted hosts are skipped', () => {
  // YouTube carries playback state in short params; stripping breaks links.
  const url = 'https://www.youtube.com/watch?v=abc&si=xyz';
  assert.equal(stripTrackingParams(url), url);
});

test('duplicate tracking keys are all removed', () => {
  assert.equal(
    stripTrackingParams('https://example.com/?utm_source=a&utm_source=b&q=1'),
    'https://example.com/?q=1'
  );
});

test('values containing encoded characters do not break re-encoding', () => {
  const out = stripTrackingParams('https://example.com/?q=a%20b&utm_source=x');
  assert.ok(out.includes('q=a'), 'the real parameter survived');
  assert.ok(!out.includes('utm_source'));
});
