import assert from 'node:assert/strict';
import {
  DEFAULT_GENERAL_SETTINGS,
  acceptLanguagesFor,
  clampNumber,
  normalizeSettingsUrl,
  resolveLocale,
  toMainSettings,
} from './generalSettings';

// ── URL validation ───────────────────────────────────────────────────────────

assert.equal(normalizeSettingsUrl('example.com'), 'https://example.com/');
assert.equal(normalizeSettingsUrl('  example.com/path  '), 'https://example.com/path');
assert.equal(normalizeSettingsUrl('https://example.com/a?b=c'), 'https://example.com/a?b=c');
assert.equal(normalizeSettingsUrl('http://localhost:3000'), 'http://localhost:3000/');

// Anything that is clearly not an address must be rejected, not silently
// turned into https://hello%20world.
assert.equal(normalizeSettingsUrl(''), null);
assert.equal(normalizeSettingsUrl('   '), null);
assert.equal(normalizeSettingsUrl('hello world'), null);
assert.equal(normalizeSettingsUrl('notadomain'), null);
assert.equal(normalizeSettingsUrl('javascript:alert(1)'), null);
assert.equal(normalizeSettingsUrl('file:///etc/passwd'), null);
assert.equal(normalizeSettingsUrl('https://exa\u0000mple.com'), null);
assert.equal(normalizeSettingsUrl(`https://example.com/${'a'.repeat(3000)}`), null);

// ── Clamping ─────────────────────────────────────────────────────────────────

assert.equal(clampNumber(5, 10, 20), 10);
assert.equal(clampNumber(25, 10, 20), 20);
assert.equal(clampNumber(15, 10, 20), 15);
assert.equal(clampNumber(Number.NaN, 10, 20), 10);

// ── Accept-Language ──────────────────────────────────────────────────────────

assert.equal(acceptLanguagesFor('en-US'), 'en-US,en');
assert.equal(acceptLanguagesFor('en-IN'), 'en-IN,en');
assert.equal(acceptLanguagesFor('bn'), 'bn,en-US,en');
assert.equal(acceptLanguagesFor('hi'), 'hi,en-US,en');

// ── Locale resolution ────────────────────────────────────────────────────────

assert.equal(resolveLocale({ browserLanguage: 'en-US', region: 'system' }), 'en-US');
assert.equal(resolveLocale({ browserLanguage: 'en-US', region: 'IN' }), 'en-IN');
assert.equal(resolveLocale({ browserLanguage: 'bn', region: 'BD' }), 'bn-BD');

// ── Main-process projection ──────────────────────────────────────────────────

const main = toMainSettings(DEFAULT_GENERAL_SETTINGS);
assert.equal(main.acceptLanguages, 'en-US,en');
assert.equal(main.defaultFontSize, DEFAULT_GENERAL_SETTINGS.defaultFontSize);
assert.equal(main.defaultZoom, 1);

// Out-of-range values coming from a hand-edited settings file must not reach
// Chromium unclamped.
const clamped = toMainSettings({
  ...DEFAULT_GENERAL_SETTINGS,
  defaultFontSize: 999,
  minimumFontSize: -50,
  defaultZoom: 100,
});
assert.equal(clamped.defaultFontSize, 32);
assert.equal(clamped.minimumFontSize, 0);
assert.equal(clamped.defaultZoom, 5);

// Every default must be defined — an undefined default persists as undefined
// and the control renders uncontrolled.
for (const [key, value] of Object.entries(DEFAULT_GENERAL_SETTINGS)) {
  assert.notEqual(value, undefined, `default for ${key} is undefined`);
}

console.log('✓ generalSettings tests passed');
