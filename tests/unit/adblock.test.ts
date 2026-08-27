import { describe, it, expect } from 'vitest';
import { FiltersEngine, Request } from '@ghostery/adblocker';

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

describe('Ghostery network filtering', () => {
  it('blocks an ad resource', () => {
    const engine = FiltersEngine.parse('||ads.example^');
    expect(engine.match(request()).match).toBe(true);
  });

  it('lets exceptions override an ad rule', () => {
    const engine = FiltersEngine.parse('||ads.example^\n@@||ads.example/allowed.js');
    expect(engine.match(request()).match).toBe(true);
    expect(
      engine.match(request({ url: 'https://ads.example/allowed.js' })).match,
    ).toBe(false);
  });

  it('allows ordinary content', () => {
    const engine = FiltersEngine.parse('||ads.example^');
    expect(
      engine.match(
        request({
          url: 'https://cdn.example.org/app.js',
          sourceUrl: 'https://news.example/article',
        }),
      ).match,
    ).toBe(false);
  });
});
