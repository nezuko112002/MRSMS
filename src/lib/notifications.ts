import { parseHistoryComments } from '@/lib/historyComments';
import type { ApprovalHistory, Profile, UserRole } from '@/types';

export type NotificationCategory = 'request' | 'approval' | 'warehouse' | 'confirmation';

export type NotificationTarget = 'approval' | 'warehouse' | 'confirmation' | 'detail';

export interface NotificationRequest {
  id: string;
  request_no: string;
  project_name: string;
  requested_by: string;
}

export type HistoryWithRequest = Omit<ApprovalHistory, 'profile'> & {
  request?: NotificationRequest | null;
  profile?: { full_name: string };
};

export interface AppNotification {
  id: string;
  requestId: string;
  requestNo: string;
  projectName: string;
  action: string;
  title: string;
  subtitle: string;
  category: NotificationCategory;
  actorName: string;
  createdAt: string;
  unread: boolean;
  target: NotificationTarget;
}

const ACTION_CATEGORY: Record<string, NotificationCategory> = {
  submitted: 'request',
  saved_draft: 'request',
  pending: 'approval',
  approved: 'approval',
  partially_approved: 'approval',
  rejected: 'approval',
  released: 'warehouse',
  partially_released: 'warehouse',
  confirmed: 'confirmation',
  completed: 'confirmation',
};

const ROLE_ACTIONS: Record<UserRole, string[] | 'all'> = {
  requestor: ['approved', 'partially_approved', 'rejected', 'released', 'partially_released', 'confirmed', 'completed'],
  manager: ['submitted'],
  warehouse: ['approved', 'partially_approved', 'released', 'partially_released'],
  finance: ['released', 'partially_released', 'confirmed', 'completed'],
  admin: 'all',
};

const NOISE_ACTIONS = new Set(['saved_draft']);

const ACTION_TITLES: Record<string, string> = {
  submitted: 'New request submitted',
  saved_draft: 'Draft saved',
  approved: 'Request fully approved',
  partially_approved: 'Items approved',
  rejected: 'Request rejected',
  released: 'Materials released',
  partially_released: 'Partial release',
  confirmed: 'Receipt confirmed',
  completed: 'Request completed',
  pending: 'Pending review',
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  request: 'Request',
  approval: 'Approval',
  warehouse: 'Warehouse',
  confirmation: 'Confirmation',
};

export function getCategoryLabel(category: NotificationCategory) {
  return CATEGORY_LABELS[category];
}

function readStorageKey(userId: string) {
  return `notifications_read_at_${userId}`;
}

export function getLastReadAt(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(readStorageKey(userId));
}

export function markNotificationsRead(userId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(readStorageKey(userId), new Date().toISOString());
}

export function isNotificationVisible(
  entry: HistoryWithRequest,
  profile: Pick<Profile, 'id' | 'role'>,
): boolean {
  if (!entry.request) return false;

  const { action, action_by, request } = entry;
  const role = profile.role;

  if (role !== 'admin' && NOISE_ACTIONS.has(action)) return false;

  const roleActions = ROLE_ACTIONS[role];
  if (roleActions !== 'all' && !roleActions.includes(action)) return false;

  if (role === 'admin') return true;

  if (role === 'requestor') {
    if (request.requested_by !== profile.id) return false;
    if (action_by === profile.id) return false;
    return true;
  }

  if (action_by === profile.id) return false;

  return true;
}

export function getNotificationTarget(
  role: UserRole,
  action: string,
): NotificationTarget {
  if (action === 'submitted' || action === 'pending') return 'approval';
  if (action === 'approved' || action === 'partially_approved') {
    if (role === 'manager') return 'detail';
    return 'warehouse';
  }
  if (action === 'released' || action === 'partially_released') {
    if (role === 'requestor') return 'confirmation';
    return 'detail';
  }
  return 'detail';
}

export function historyToNotification(
  entry: HistoryWithRequest,
  profile: Pick<Profile, 'id' | 'role'>,
  lastReadAt: string | null,
): AppNotification | null {
  if (!isNotificationVisible(entry, profile)) return null;
  if (!entry.request) return null;

  const { message } = parseHistoryComments(entry.comments);
  const action = entry.action;
  const title = ACTION_TITLES[action] || action.replace(/_/g, ' ');
  const unread = !lastReadAt || new Date(entry.created_at) > new Date(lastReadAt);

  return {
    id: entry.id,
    requestId: entry.request.id,
    requestNo: entry.request.request_no,
    projectName: entry.request.project_name,
    action,
    title,
    subtitle: message || `${entry.request.request_no} · ${entry.request.project_name}`,
    category: ACTION_CATEGORY[action] || 'request',
    actorName: entry.profile?.full_name || 'Someone',
    createdAt: entry.created_at,
    unread,
    target: getNotificationTarget(profile.role, action),
  };
}

export function mapHistoryToNotifications(
  history: HistoryWithRequest[],
  profile: Pick<Profile, 'id' | 'role'>,
  lastReadAt: string | null,
): AppNotification[] {
  return history
    .map(entry => historyToNotification(entry, profile, lastReadAt))
    .filter((n): n is AppNotification => n !== null);
}
