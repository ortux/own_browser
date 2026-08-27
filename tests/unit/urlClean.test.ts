import { describe, it, expect } from 'vitest';
import { stripTrackingParams, isTrackingParam } from '../../src/shared/urlClean';

describe('isTrackingParam', () => {
  it('flags utm_* parameters', () => {
    expect(isTrackingParam('utm_source')).toBe(true);
    expect(isTrackingParam('UTM_Medium')).toBe(true);
    expect(isTrackingParam('utm_term')).toBe(true);
  });

  it('flags known click identifiers', () => {
    expect(isTrackingParam('fbclid')).toBe(true);
    expect(isTrackingParam('gclid')).toBe(true);
    expect(isTrackingParam('msclkid')).toBe(true);
  });

  it('keeps ordinary parameters', () => {
    expect(isTrackingParam('q')).toBe(false);
    expect(isTrackingParam('page')).toBe(false);
    expect(isTrackingParam('id')).toBe(false);
    expect(isTrackingParam('puzzle')).toBe(false); // must not prefix-match 'pk_' style
  });
});

describe('stripTrackingParams', () => {
  it('removes tracking params and keeps the rest in order', () => {
    expect(
      stripTrackingParams('https://example.com/?utm_source=x&id=42&fbclid=abc'),
    ).toBe('https://example.com/?id=42');
  });

  it('drops the query entirely when everything was tracking', () => {
    expect(stripTrackingParams('https://example.com/page?utm_campaign=launch'))
      .toBe('https://example.com/page');
  });

  it('keeps hash fragments and repeated params', () => {
    expect(stripTrackingParams('https://example.com/?tag=a&tag=b&gclid=x#section'))
      .toBe('https://example.com/?tag=a&tag=b#section');
  });

  it('returns non-http(s) and unparseable input unchanged', () => {
    expect(stripTrackingParams('zyphora://downloads')).toBe('zyphora://downloads');
    expect(stripTrackingParams('not a url')).toBe('not a url');
    expect(stripTrackingParams('')).toBe('');
  });

  it('leaves clean URLs byte-identical', () => {
    const url = 'https://example.com/watch?v=dQw4w9WgXcQ&t=42';
    expect(stripTrackingParams(url)).toBe(url);
  });
});
