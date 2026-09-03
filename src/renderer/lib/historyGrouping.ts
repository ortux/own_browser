import type { HistoryEntry } from '../../shared/types';

export type HistoryGroup = {
  label: string;
  entries: HistoryEntry[];
};

const MS_DAY = 86_400_000;
const MS_WEEK = 7 * MS_DAY;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupHistory(entries: HistoryEntry[]): HistoryGroup[] {
  const now = Date.now();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - MS_DAY;
  const weekStart = todayStart - MS_WEEK;

  const today: HistoryEntry[] = [];
  const yesterday: HistoryEntry[] = [];
  const thisWeek: HistoryEntry[] = [];
  const earlier: HistoryEntry[] = [];

  for (const e of entries) {
    if (e.visited_at >= todayStart) today.push(e);
    else if (e.visited_at >= yesterdayStart) yesterday.push(e);
    else if (e.visited_at >= weekStart) thisWeek.push(e);
    else earlier.push(e);
  }

  const out: HistoryGroup[] = [];
  if (today.length) out.push({ label: 'Today', entries: today });
  if (yesterday.length) out.push({ label: 'Yesterday', entries: yesterday });
  if (thisWeek.length) out.push({ label: 'This week', entries: thisWeek });
  if (earlier.length) out.push({ label: 'Earlier', entries: earlier });
  return out;
}
