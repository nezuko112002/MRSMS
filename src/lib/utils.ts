import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import type { RequestStatus, ItemStatus, UserRole, MaterialRequest, MaterialRequestItem } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'MMM d, yyyy');
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

// Status badge config
export const REQUEST_STATUS_CONFIG: Record<RequestStatus, { label: string; color: string }> = {
  draft:               { label: 'Draft',              color: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
  pending:             { label: 'Pending',             color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  approved:            { label: 'Approved',            color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  partially_approved:  { label: 'Partially Approved',  color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
  rejected:            { label: 'Rejected',            color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  released:            { label: 'Released',            color: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  partially_released:  { label: 'Partially Released',  color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  confirmed:           { label: 'Confirmed',           color: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
  completed:           { label: 'Completed',           color: 'bg-green-500/15 text-green-400 border-green-500/20' },
};

export const ITEM_STATUS_CONFIG: Record<ItemStatus, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  approved: { label: 'Approved', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  rejected: { label: 'Rejected', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  released: { label: 'Released', color: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  received: { label: 'Received', color: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
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

export function requestNeedsApprovalReview(
  request: Pick<MaterialRequest, 'status'> | null | undefined,
  items?: Pick<MaterialRequestItem, 'status'>[] | null
): boolean {
  if (!request) return false;
  if (items) return hasPendingApprovalItems(items);
  return request.status === 'pending';
}

export interface ItemStatusSummary {
  pending: number;
  approved: number;
  rejected: number;
  released: number;
  received: number;
  total: number;
}

export function summarizeItemStatuses(
  items: Pick<MaterialRequestItem, 'status'>[]
): ItemStatusSummary {
  return {
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
    released: items.filter(i => i.status === 'released').length,
    received: items.filter(i => i.status === 'received').length,
    total: items.length,
  };
}

export function getDisplayRequestStatus(
  request: Pick<MaterialRequest, 'status'>,
  items?: Pick<MaterialRequestItem, 'status'>[] | null
): RequestStatus {
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
  requestor: { label: 'Requestor',       color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  manager:   { label: 'Dept. Manager',   color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  warehouse: { label: 'Warehouse',       color: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  finance:   { label: 'Finance',         color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  admin:     { label: 'Administrator',   color: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

export const DEPARTMENTS = [
  'Civil Works', 'Electrical', 'Mechanical', 'Structural', 'Architecture',
  'Plumbing', 'Finishing', 'Site Management', 'Procurement', 'General'
];

export const UNITS = [
  'Piece', 'Bag', 'Length', 'Roll', 'Sheet', 'Bundle', 'Set',
  'Kilo', 'Gram', 'Liter', 'Gallon', 'Can', 'Box', 'Cu.m', 'Sq.m', 'Meter', 'Foot'
];
