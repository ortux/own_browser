import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedNavigationUrl,
  normalizeNavigationUrl,
  isInternalPageUrl,
  INTERNAL_PAGES,
  INTERNAL_PAGE_TITLES,
} from './navigation';

test('file: URLs must be local', () => {
  assert.equal(isAllowedNavigationUrl('file:///home/user/page.html'), true);
  assert.equal(isAllowedNavigationUrl('file://localhost/home/user/page.html'), true);
  // A remote/UNC host must not be loadable from the address bar.
  assert.equal(isAllowedNavigationUrl('file://evil.com/share/payload.html'), false);
});

test('dangerous schemes are rejected', () => {
  assert.equal(normalizeNavigationUrl('javascript:alert(1)'), null);
  assert.equal(normalizeNavigationUrl('data:text/html,<script>x</script>'), null);
  assert.equal(normalizeNavigationUrl('chrome-error://chromewebdata/'), null);
});

test('ordinary web URLs and bare hosts still work', () => {
  assert.equal(isAllowedNavigationUrl('https://example.com'), true);
  assert.equal(normalizeNavigationUrl('example.com'), 'https://example.com');
  assert.equal(normalizeNavigationUrl('localhost:3000'), 'https://localhost:3000');
});

test('known internal pages are navigable, unknown ones are not', () => {
  assert.equal(isAllowedNavigationUrl(INTERNAL_PAGES.settings), true);
  assert.equal(isAllowedNavigationUrl(INTERNAL_PAGES.downloads), true);
  assert.equal(normalizeNavigationUrl('zyphora://settings'), 'zyphora://settings');

  // An allowlist, not a prefix test: an unrecognised internal URL must fail to
  // navigate rather than opening a tab that renders as a blank page.
  assert.equal(isAllowedNavigationUrl('zyphora://not-a-page'), false);
  assert.equal(normalizeNavigationUrl('zyphora://not-a-page'), null);
});

test('every internal page has a title and is recognised', () => {
  for (const url of Object.values(INTERNAL_PAGES)) {
    assert.equal(isInternalPageUrl(url), true, `${url} should be an internal page`);
    assert.ok(INTERNAL_PAGE_TITLES[url], `${url} should have a tab title`);
  }
  assert.equal(isInternalPageUrl('https://example.com'), false);
});
