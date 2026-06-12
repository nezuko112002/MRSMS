import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import type { RequestStatus, ItemStatus, UserRole, MaterialRequest, MaterialRequestItem, Project } from '@/types';
import { isWarehouseDeferred } from '@/lib/warehouseDeferred';

export type ItemStatusFields = Pick<
  MaterialRequestItem,
  'status' | 'release_deferred' | 'purpose' | 'approved_qty' | 'released_qty' | 'requested_qty'
>;

export function getApprovedQty(
  item: Pick<MaterialRequestItem, 'approved_qty' | 'requested_qty'>
): number {
  const approved = item.approved_qty ?? item.requested_qty ?? 0;
  return Number(approved) || 0;
}

export function getRemainingReleaseQty(item: Pick<MaterialRequestItem, 'approved_qty' | 'released_qty' | 'requested_qty'>): number {
  const approved = getApprovedQty(item);
  const released = Number(item.released_qty ?? 0) || 0;
  return Math.max(0, approved - released);
}

export function itemNeedsMoreRelease(item: ItemStatusFields): boolean {
  if (item.status === 'pending' || item.status === 'rejected' || item.status === 'received') {
    return false;
  }
  return getRemainingReleaseQty(item) > 0;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy');
}

export function getRequestProjectName(
  request: Pick<MaterialRequest, 'project_name'> & { project?: Pick<Project, 'name'> | null }
) {
  return request.project?.name ?? request.project_name;
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-PH').format(n);
}

// Status badge config — class names defined in globals.css
export const REQUEST_STATUS_CONFIG: Record<RequestStatus, { label: string; color: string }> = {
  draft:               { label: 'Draft',              color: 'badge-draft' },
  pending:             { label: 'Pending',             color: 'badge-pending' },
  approved:            { label: 'Approved',            color: 'badge-approved' },
  partially_approved:  { label: 'Partially Approved',  color: 'badge-partially-approved' },
  rejected:            { label: 'Rejected',            color: 'badge-rejected' },
  released:            { label: 'Released',            color: 'badge-released' },
  partially_released:  { label: 'Partially Released',  color: 'badge-partially-released' },
  confirmed:           { label: 'Confirmed',           color: 'badge-confirmed' },
  completed:           { label: 'Completed',           color: 'badge-completed' },
};

export const ITEM_STATUS_CONFIG: Record<ItemStatus, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: 'badge-item-pending' },
  approved: { label: 'Approved', color: 'badge-item-approved' },
  rejected: { label: 'Rejected', color: 'badge-item-rejected' },
  released: { label: 'Released', color: 'badge-item-released' },
  received: { label: 'Received', color: 'badge-item-received' },
};

export function canCreateRequest(role: UserRole | undefined): boolean {
  return role === 'requestor' || role === 'admin';
}

const DELETABLE_REQUEST_STATUSES: RequestStatus[] = ['draft', 'pending', 'rejected'];

export function hasPendingApprovalItems(
  items?: Pick<MaterialRequestItem, 'status'>[] | null
): boolean {
  return !!items?.some(i => i.status === 'pending');
}

export function getInitialItemReviewAction(
  item: Pick<MaterialRequestItem, 'status'>
): 'approve' | 'reject' | 'pending' {
  if (item.status === 'rejected') return 'reject';
  if (item.status === 'approved') return 'approve';
  if (item.status === 'pending') return 'pending';
  return 'approve';
}

export function requestNeedsApprovalReview(
  request: Pick<MaterialRequest, 'status'> | null | undefined,
  items?: Pick<MaterialRequestItem, 'status'>[] | null
): boolean {
  if (!request) return false;
  if (request.status === 'draft') return false;
  if (items) return hasPendingApprovalItems(items);
  return request.status === 'pending' || request.status === 'partially_approved' || request.status === 'partially_released';
}

export interface ItemStatusSummary {
  pending: number;
  approved: number;
  rejected: number;
  released: number;
  received: number;
  total: number;
}

export function getDisplayItemStatus(item: ItemStatusFields): ItemStatus {
  if (item.status === 'approved' && isWarehouseDeferred(item)) {
    return 'pending';
  }
  if (itemNeedsMoreRelease(item)) {
    const alreadyReleased = (item.released_qty ?? 0) > 0;
    if (alreadyReleased || isWarehouseDeferred(item)) {
      return 'pending';
    }
    return 'approved';
  }
  return item.status;
}

export function summarizeItemStatuses(
  items: ItemStatusFields[]
): ItemStatusSummary {
  return {
    pending: items.filter(i => getDisplayItemStatus(i) === 'pending').length,
    approved: items.filter(i => getDisplayItemStatus(i) === 'approved').length,
    rejected: items.filter(i => getDisplayItemStatus(i) === 'rejected').length,
    released: items.filter(i => getDisplayItemStatus(i) === 'released').length,
    received: items.filter(i => getDisplayItemStatus(i) === 'received').length,
    total: items.length,
  };
}

export function getDisplayRequestStatus(
  request: Pick<MaterialRequest, 'status'>,
  items?: Pick<MaterialRequestItem, 'status'>[] | null
): RequestStatus {
  // Draft is a request-level state before submission; item rows still default to pending.
  if (request.status === 'draft') return 'draft';
  if (items && items.length > 0) return computeRequestStatusFromItems(items);
  return request.status;
}

export interface ItemProgressBadge {
  label: string;
  color: string;
}

export function getItemProgressBadges(summary: ItemStatusSummary): ItemProgressBadge[] {
  if (!hasMixedItemProgress(summary)) return [];

  const badges: ItemProgressBadge[] = [];
  if (summary.pending > 0) {
    badges.push({ label: `${summary.pending} pending`, color: ITEM_STATUS_CONFIG.pending.color });
  }
  if (summary.approved > 0) {
    badges.push({ label: `${summary.approved} awaiting release`, color: ITEM_STATUS_CONFIG.approved.color });
  }
  if (summary.released > 0) {
    badges.push({ label: `${summary.released} released`, color: ITEM_STATUS_CONFIG.released.color });
  }
  if (summary.received > 0) {
    badges.push({ label: `${summary.received} received`, color: ITEM_STATUS_CONFIG.received.color });
  }
  if (summary.rejected > 0 && summary.rejected < summary.total) {
    badges.push({ label: `${summary.rejected} rejected`, color: ITEM_STATUS_CONFIG.rejected.color });
  }
  return badges;
}

export function hasMixedItemProgress(summary: ItemStatusSummary): boolean {
  const states = [
    summary.pending > 0,
    summary.approved > 0,
    summary.rejected > 0,
    summary.released > 0,
    summary.received > 0,
  ].filter(Boolean).length;
  return states > 1;
}

export function computeRequestStatusFromItems(
  items: Pick<MaterialRequestItem, 'status'>[]
): RequestStatus {
  if (items.length === 0) return 'pending';

  const pending = items.filter(i => i.status === 'pending').length;
  const approved = items.filter(i => i.status === 'approved').length;
  const rejected = items.filter(i => i.status === 'rejected').length;
  const released = items.filter(i => i.status === 'released').length;
  const received = items.filter(i => i.status === 'received').length;
  const total = items.length;
  const active = total - rejected;

  if (pending > 0) {
    if (released > 0 || received > 0) return 'partially_released';
    if (approved > 0) return 'partially_approved';
    return 'pending';
  }

  if (approved > 0) {
    if (released > 0 || received > 0) return 'partially_released';
    if (approved === active) return 'approved';
    return 'partially_approved';
  }

  if (rejected === total) return 'rejected';

  if (received === active) return active === total ? 'completed' : 'confirmed';
  if (released === active) return 'released';
  if (received > 0 && released > 0) return 'partially_released';
  if (received > 0) return 'confirmed';
  if (released > 0) return 'released';

  return 'partially_approved';
}

export function canDeleteRequest(
  profile: { id: string; role: UserRole } | null | undefined,
  request: Pick<MaterialRequest, 'requested_by' | 'status'> | null | undefined
): boolean {
  if (!profile || !request) return false;
  if (!DELETABLE_REQUEST_STATUSES.includes(request.status)) return false;
  if (profile.role === 'admin') return true;
  return request.requested_by === profile.id;
}

export const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  requestor: { label: 'Requestor',       color: 'bg-blue-500/15 text-blue-400 border border-blue-500/20' },
  manager:   { label: 'Dept. Manager',   color: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
  warehouse: { label: 'Warehouse',       color: 'bg-violet-500/15 text-violet-400 border border-violet-500/20' },
  finance:   { label: 'Finance',         color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' },
  admin:     { label: 'Administrator',   color: 'bg-rose-500/15 text-rose-400 border border-rose-500/20' },
};

export const DEPARTMENTS = [
  'Civil Works', 'Electrical', 'Mechanical', 'Structural', 'Architecture',
  'Plumbing', 'Finishing', 'Site Management', 'Procurement', 'General'
];

export const UNITS = [
  'Piece', 'Bag', 'Length', 'Roll', 'Sheet', 'Bundle', 'Set',
  'Kilo', 'Gram', 'Liter', 'Gallon', 'Can', 'Box', 'Cu.m', 'Sq.m', 'Meter', 'Foot'
];
