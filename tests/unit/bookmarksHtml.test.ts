import { describe, it, expect } from 'vitest';
import { bookmarksToHtml, parseBookmarksHtml } from '../../src/main/bookmarksHtml';

const SAMPLE = [
  { url: 'https://example.com/', title: 'Example', createdAt: 1700000000000 },
  { url: 'https://news.ycombinator.com/', title: 'HN <Tech> & "News"' },
];

describe('bookmarksToHtml', () => {
  it('produces Netscape-format HTML with escaped attributes', () => {
    const html = bookmarksToHtml(SAMPLE);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('HREF="https://example.com/"');
    expect(html).toContain('ADD_DATE="1700000000"');
    expect(html).toContain('HN &lt;Tech&gt; &amp; &quot;News&quot;');
  });
});

describe('parseBookmarksHtml', () => {
  it('round-trips bookmarks exported by bookmarksToHtml', () => {
    const parsed = parseBookmarksHtml(bookmarksToHtml(SAMPLE));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ url: 'https://example.com/', title: 'Example' });
    expect(parsed[0].createdAt).toBe(1700000000000);
    expect(parsed[1].title).toBe('HN <Tech> & "News"');
  });

  it('parses a Chrome-style export with ICON attributes and folders', () => {
    const chromeExport = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<DL><p>
    <DT><H3>Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://github.com/" ICON="data:image/png;base64,xxx" ADD_DATE="1600000000">GitHub</A>
        <DT><A HREF="javascript:alert(1)">bad</A>
        <DT><A HREF="https://github.com/" ADD_DATE="1600000001">GitHub duplicate</A>
    </DL><p>
</DL><p>`;
    const parsed = parseBookmarksHtml(chromeExport);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ url: 'https://github.com/', title: 'GitHub' });
  });

  it('handles single-quoted hrefs and unquoted add_date values', () => {
    const html = `<DL><p><DT><A HREF='https://a.dev/x?y=1' ADD_DATE=1599999999>A Dev</A></DL><p>`;
    const parsed = parseBookmarksHtml(html);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].createdAt).toBe(1599999999000);
  });

  it('returns empty for input without anchors', () => {
    expect(parseBookmarksHtml('<html><body>nothing</body></html>')).toEqual([]);
    expect(parseBookmarksHtml('')).toEqual([]);
  });
});
