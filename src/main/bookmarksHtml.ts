/**
 * Netscape bookmark-file format (de)serialisation.
 *
 * This is the lingua franca every browser exports to — importing a
 * bookmarks.html from Chrome/Firefox/Brave/Edge and exporting one for any of
 * them uses the same basic DT/A structure.
 */

export interface BookmarkItem {
  url: string;
  title: string;
  /** Unix ms (optional; importers map addDate seconds → ms). */
  createdAt?: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Serialise bookmarks to the Netscape HTML format. */
export function bookmarksToHtml(items: BookmarkItem[], title = 'Zyphora Bookmarks'): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. It will be read and overwritten. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const folderDate = Math.floor(Date.now() / 1000);
  lines.push(`    <DT><H3 ADD_DATE="${folderDate}" LAST_MODIFIED="${folderDate}">${escapeHtml(title)}</H3>`);
  lines.push('    <DL><p>');
  for (const item of items) {
    const add = item.createdAt ? Math.floor(item.createdAt / 1000) : folderDate;
    lines.push(
      `        <DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${add}">${escapeHtml(item.title)}</A>`,
    );
  }
  lines.push('    </DL><p>');
  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * Parse a Netscape bookmarks.html file. Tolerant by design: browsers produce
 * wildly inconsistent formatting (attribute case, ICON attributes, entities).
 * Folders are flattened; entries without a usable http(s) URL are skipped.
 */
export function parseBookmarksHtml(html: string): BookmarkItem[] {
  const out: BookmarkItem[] = [];
  const seen = new Set<string>();

  // Match <A HREF="...">…</A> (case-insensitive attributes/tag), tolerating
  // extra attributes like ADD_DATE / ICON / TAGS between HREF and the >.
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const hrefPattern = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
  const addDatePattern = /\sadd_date\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
  const tagPattern = /<[^>]+>/g;

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const hrefMatch = attrs.match(hrefPattern);
    if (!hrefMatch) continue;
    const href = unescapeHtml(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '');
    if (!/^https?:\/\//i.test(href)) continue;

    const title = unescapeHtml(inner.replace(tagPattern, '').trim()) || href;
    const dateMatch = attrs.match(addDatePattern);
    const addDateSeconds = Number(dateMatch?.[2] ?? dateMatch?.[3] ?? dateMatch?.[4] ?? Number.NaN);
    const createdAt = Number.isFinite(addDateSeconds) && addDateSeconds > 0
      ? addDateSeconds * 1000
      : undefined;

    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ url: href, title, createdAt });
    if (out.length >= 5_000) break; // defensive cap for pathological files
  }
  return out;
}
