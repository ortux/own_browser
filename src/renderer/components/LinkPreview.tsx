import React from 'react';

interface LinkPreviewProps {
  url: string | null;
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Show hostname + pathname, skip default ports and trailing slash
    let display = parsed.hostname;
    if (parsed.pathname && parsed.pathname !== '/') {
      display += parsed.pathname;
    }
    return display;
  } catch {
    return url;
  }
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  if (!url) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-[var(--bg)] border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] truncate shadow-sm">
        {getDisplayUrl(url)}
      </div>
    </div>
  );
};
