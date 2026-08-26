import React, { useState } from 'react';
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode2,
  FileArchive,
  FileSpreadsheet,
  File as FileIcon,
  Globe,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import type { Tab } from '../../shared/types';

type IconDef = { Icon: LucideIcon; color: string };

const FILE_TYPES: Record<string, IconDef> = {
  // Documents
  pdf: { Icon: FileText, color: '#e2483d' },
  doc: { Icon: FileText, color: '#2b579a' },
  docx: { Icon: FileText, color: '#2b579a' },
  txt: { Icon: FileText, color: '#7a7a7a' },
  md: { Icon: FileText, color: '#519aba' },
  rtf: { Icon: FileText, color: '#7a7a7a' },
  // Spreadsheets
  xls: { Icon: FileSpreadsheet, color: '#217346' },
  xlsx: { Icon: FileSpreadsheet, color: '#217346' },
  csv: { Icon: FileSpreadsheet, color: '#217346' },
  // Presentations
  ppt: { Icon: FileText, color: '#d24726' },
  pptx: { Icon: FileText, color: '#d24726' },
  // Images
  png: { Icon: FileImage, color: '#3b9eff' },
  jpg: { Icon: FileImage, color: '#3b9eff' },
  jpeg: { Icon: FileImage, color: '#3b9eff' },
  gif: { Icon: FileImage, color: '#3b9eff' },
  webp: { Icon: FileImage, color: '#3b9eff' },
  svg: { Icon: FileImage, color: '#3b9eff' },
  bmp: { Icon: FileImage, color: '#3b9eff' },
  ico: { Icon: FileImage, color: '#3b9eff' },
  // Video
  mp4: { Icon: FileVideo, color: '#a259ff' },
  webm: { Icon: FileVideo, color: '#a259ff' },
  mkv: { Icon: FileVideo, color: '#a259ff' },
  mov: { Icon: FileVideo, color: '#a259ff' },
  avi: { Icon: FileVideo, color: '#a259ff' },
  // Audio
  mp3: { Icon: FileAudio, color: '#1db954' },
  wav: { Icon: FileAudio, color: '#1db954' },
  ogg: { Icon: FileAudio, color: '#1db954' },
  flac: { Icon: FileAudio, color: '#1db954' },
  m4a: { Icon: FileAudio, color: '#1db954' },
  // Archives
  zip: { Icon: FileArchive, color: '#f0a500' },
  rar: { Icon: FileArchive, color: '#f0a500' },
  '7z': { Icon: FileArchive, color: '#f0a500' },
  tar: { Icon: FileArchive, color: '#f0a500' },
  gz: { Icon: FileArchive, color: '#f0a500' },
  // Code / data
  js: { Icon: FileCode2, color: '#f7df1e' },
  ts: { Icon: FileCode2, color: '#3178c6' },
  jsx: { Icon: FileCode2, color: '#f7df1e' },
  tsx: { Icon: FileCode2, color: '#3178c6' },
  json: { Icon: FileCode2, color: '#cbcb41' },
  html: { Icon: FileCode2, color: '#e44d26' },
  htm: { Icon: FileCode2, color: '#e44d26' },
  css: { Icon: FileCode2, color: '#1572b6' },
  xml: { Icon: FileCode2, color: '#1572b6' },
  py: { Icon: FileCode2, color: '#3572a5' },
  // Fallback
  file: { Icon: FileIcon, color: '#9b9b9b' },
};

function fileTypeFor(url: string): IconDef | null {
  let pathname: string;
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') {
      pathname = u.pathname;
    } else if (u.pathname) {
      pathname = u.pathname;
    } else {
      return null;
    }
  } catch {
    return null;
  }
  pathname = decodeURIComponent(pathname.split('?')[0].split('#')[0]);
  if (!pathname.includes('.')) return null;
  const segment = pathname.split('/').pop() || '';
  const ext = segment.includes('.') ? segment.split('.').pop()!.toLowerCase() : '';
  if (!ext) return null;
  return FILE_TYPES[ext] || null;
}

interface TabFaviconProps {
  tab: Tab;
  size?: number;
  className?: string;
}

export const TabFavicon: React.FC<TabFaviconProps> = ({ tab, size = 16, className }) => {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const cls = className ?? '';

  if (tab.loading) {
    return (
      <Loader2
        size={size}
        className={`animate-spin ${cls}`}
        style={{ color: 'var(--text-faint)' }}
      />
    );
  }

  if (tab.favicon && !faviconFailed) {
    return (
      <img
        src={tab.favicon}
        alt=""
        width={size}
        height={size}
        className={`rounded-sm ${cls}`}
        onError={() => setFaviconFailed(true)}
      />
    );
  }

  const file = fileTypeFor(tab.url);
  if (file) {
    const { Icon, color } = file;
    return <Icon size={size} className={cls} style={{ color }} />;
  }

  return <Globe size={size} className={cls} style={{ color: 'var(--text-faint)' }} />;
};
