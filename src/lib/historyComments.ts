import type { ItemStatus } from '@/types';

const ITEMS_PREFIX = 'Items: ';
const MESSAGE_SEP = ' · ';

export interface HistoryItemRef {
  sort_order: number;
  description: string;
  status?: ItemStatus;
}

export function formatItemRefs(items: HistoryItemRef[]): string {
  return [...items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => `#${item.sort_order + 1} ${item.description}`)
    .join('; ');
}

export function buildHistoryComments(opts: {
  itemRefs?: string;
  message?: string | null;
}): string | null {
  const parts: string[] = [];
  if (opts.itemRefs) parts.push(`${ITEMS_PREFIX}${opts.itemRefs}`);
  if (opts.message?.trim()) parts.push(opts.message.trim());
  return parts.length ? parts.join(MESSAGE_SEP) : null;
}

export function parseHistoryComments(comments: string | null): {
  items: string[] | null;
  message: string | null;
} {
  if (!comments) return { items: null, message: null };

  if (comments.startsWith(ITEMS_PREFIX)) {
    const sepIdx = comments.indexOf(MESSAGE_SEP);
    const itemsPart = sepIdx >= 0 ? comments.slice(ITEMS_PREFIX.length, sepIdx) : comments.slice(ITEMS_PREFIX.length);
    const message = sepIdx >= 0 ? comments.slice(sepIdx + MESSAGE_SEP.length) : null;
    const items = itemsPart
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    return { items: items.length ? items : null, message };
  }

  return { items: null, message: comments };
}

function itemRefLabel(item: HistoryItemRef): string {
  return `#${item.sort_order + 1} ${item.description}`;
}

export function getTimelineItemRefs(
  entry: { action: string; comments: string | null },
  requestItems: HistoryItemRef[],
  allHistory: { action: string; comments: string | null }[],
  entryIndex: number,
): string[] {
  const parsed = parseHistoryComments(entry.comments);
  if (parsed.items?.length) return parsed.items;

  const sorted = [...requestItems].sort((a, b) => a.sort_order - b.sort_order);
  const label = (items: HistoryItemRef[]) => items.map(itemRefLabel);

  switch (entry.action) {
    case 'submitted':
      return label(sorted);

    case 'approved':
      return label(sorted.filter(i => i.status && i.status !== 'pending'));

    case 'rejected':
      return label(sorted.filter(i => i.status === 'rejected'));

    case 'released': {
      const released = sorted.filter(i => i.status === 'released' || i.status === 'received');
      const releaseEvents = allHistory
        .map((h, idx) => ({ h, idx }))
        .filter(({ h }) => h.action === 'released');
      const releasePos = releaseEvents.findIndex(e => e.idx === entryIndex);

      if (releaseEvents.length <= 1) return label(released);

      const chunkSize = Math.max(1, Math.ceil(released.length / releaseEvents.length));
      const start = releasePos * chunkSize;
      return label(released.slice(start, start + chunkSize));
    }

    case 'partially_released':
      return label(sorted.filter(i => i.status === 'pending'));

    case 'partially_approved': {
      const decided = sorted.filter(i => i.status === 'approved' || i.status === 'rejected');
      const partialEvents = allHistory
        .map((h, idx) => ({ h, idx }))
        .filter(({ h }) => h.action === 'partially_approved');
      const eventPos = partialEvents.findIndex(e => e.idx === entryIndex);

      if (partialEvents.length <= 1) return label(decided);

      const chunkSize = Math.max(1, Math.ceil(decided.length / partialEvents.length));
      const start = eventPos * chunkSize;
      return label(decided.slice(start, start + chunkSize));
    }

    case 'confirmed':
    case 'completed':
      return label(sorted.filter(i => i.status === 'received'));

    default:
      return [];
  }
}
