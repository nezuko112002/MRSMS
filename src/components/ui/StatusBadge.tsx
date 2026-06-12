import {
  cn,
  REQUEST_STATUS_CONFIG,
  ITEM_STATUS_CONFIG,
  ROLE_CONFIG,
  getDisplayRequestStatus,
  getDisplayItemStatus,
  summarizeItemStatuses,
  getItemProgressBadges,
} from '@/lib/utils';
import type { RequestStatus, ItemStatus, UserRole, MaterialRequest, MaterialRequestItem } from '@/types';

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const cfg = REQUEST_STATUS_CONFIG[status];
  return <span className={cn('badge', cfg.color)}>{cfg.label}</span>;
}

export function ItemProgressBadges({
  items,
}: {
  items?: Pick<MaterialRequestItem, 'status' | 'release_deferred' | 'purpose' | 'approved_qty' | 'released_qty' | 'requested_qty'>[] | null;
}) {
  if (!items?.length) return <span className="text-xs text-gray-500">—</span>;

  const badges = getItemProgressBadges(summarizeItemStatuses(items));
  if (badges.length === 0) return <span className="text-xs text-gray-500">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map(badge => (
        <span key={badge.label} className={cn('badge text-[10px] px-2 py-0.5', badge.color)}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export function RequestStatusWithItems({
  request,
  items,
}: {
  request: Pick<MaterialRequest, 'status'>;
  items?: Pick<MaterialRequestItem, 'status' | 'release_deferred' | 'purpose' | 'approved_qty' | 'released_qty' | 'requested_qty'>[] | null;
}) {
  const displayStatus = getDisplayRequestStatus(request, items);
  return <RequestStatusBadge status={displayStatus} />;
}

export function ItemStatusBadge({
  item,
}: {
  item: Pick<MaterialRequestItem, 'status' | 'release_deferred' | 'purpose' | 'approved_qty' | 'released_qty' | 'requested_qty'>;
}) {
  const displayStatus = getDisplayItemStatus(item);
  const cfg = ITEM_STATUS_CONFIG[displayStatus];
  return <span className={cn('badge', cfg.color)}>{cfg.label}</span>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  const cfg = ROLE_CONFIG[role];
  return <span className={cn('badge', cfg.color)}>{cfg.label}</span>;
}
