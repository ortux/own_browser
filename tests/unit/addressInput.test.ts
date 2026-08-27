import { describe, it, expect } from 'vitest';
import { resolveAddressInput } from '../../src/renderer/lib/addressInput';

const ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', shortcut: 'ddg' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', shortcut: 'g' },
];

const build = (engine: { url: string }, query: string) =>
  engine.url.replace(/%s/g, encodeURIComponent(query));

describe('resolveAddressInput', () => {
  it('resolves bare domains to https URLs', () => {
    expect(resolveAddressInput('example.com', ENGINES, 'duckduckgo', build).url)
      .toBe('https://example.com');
  });

  it('resolves sentences to a search with the default engine', () => {
    const result = resolveAddressInput('how do magnets work', ENGINES, 'duckduckgo', build);
    expect(result.url).toBe('https://duckduckgo.com/?q=how%20do%20magnets%20work');
    expect(result.engineName).toBe('DuckDuckGo');
    expect(result.usedKeyword).toBeUndefined();
  });

  it('honours engine keyword shortcuts', () => {
    const result = resolveAddressInput('g cats', ENGINES, 'duckduckgo', build);
    expect(result.url).toBe('https://www.google.com/search?q=cats');
    expect(result.engineName).toBe('Google');
    expect(result.usedKeyword).toBe('g');
  });

  it('bare keyword opens the engine home page', () => {
    const result = resolveAddressInput('g', ENGINES, 'duckduckgo', build);
    expect(result.url).toBe('https://www.google.com/search?q=');
    expect(result.usedKeyword).toBe('g');
  });

  it('does not treat a URL containing spaces as a keyword when token is not a shortcut', () => {
    const result = resolveAddressInput('github.com/user repo', ENGINES, 'duckduckgo', build);
    expect(result.url).toBe('https://duckduckgo.com/?q=github.com%2Fuser%20repo');
  });

  it('passes internal pages straight through', () => {
    expect(resolveAddressInput('zyphora://downloads', ENGINES, 'duckduckgo', build).url)
      .toBe('zyphora://downloads');
  });

  it('falls back to a search when the input looks like a disallowed scheme', () => {
    const result = resolveAddressInput('javascript:alert(1)', ENGINES, 'duckduckgo', build);
    expect(result.url).toContain('duckduckgo.com/?q=');
  });

  it('returns an empty URL for empty input', () => {
    expect(resolveAddressInput('   ', ENGINES, 'duckduckgo', build).url).toBe('');
  });
});
