'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetCloseButton,
} from '@/components/ui/sheet';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { timeAgo, formatDateTime, cn } from '@/lib/utils';
import {
  type AppNotification,
  type HistoryWithRequest,
  getCategoryLabel,
  getLastReadAt,
  mapHistoryToNotifications,
  markNotificationsRead,
} from '@/lib/notifications';
import { useApprovalReviewSheet } from '@/hooks/useApprovalReviewSheet';
import { useWarehouseReleaseSheet } from '@/hooks/useWarehouseReleaseSheet';
import { useConfirmationReceiptSheet } from '@/hooks/useConfirmationReceiptSheet';
import { useRequestDetailSheet } from '@/hooks/useRequestDetailSheet';
import {
  Bell,
  CheckCircle,
  Clock,
  Truck,
  Package,
  XCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';

const CATEGORY_STYLES: Record<AppNotification['category'], { icon: React.ElementType; color: string }> = {
  request: { icon: FileText, color: 'text-amber-400 bg-amber-400/15' },
  approval: { icon: CheckCircle, color: 'text-emerald-400 bg-emerald-400/15' },
  warehouse: { icon: Truck, color: 'text-violet-400 bg-violet-400/15' },
  confirmation: { icon: Package, color: 'text-teal-400 bg-teal-400/15' },
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  submitted: Clock,
  rejected: XCircle,
  partially_approved: AlertCircle,
};

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead?: () => void;
}

export function NotificationsSheet({ open, onOpenChange, onRead }: NotificationsSheetProps) {
  const { profile } = useAuth();
  const supabase = createClient();
  const { openApprovalReview } = useApprovalReviewSheet();
  const { openWarehouseRelease } = useWarehouseReleaseSheet();
  const { openConfirmationReceipt } = useConfirmationReceiptSheet();
  const { openRequestDetail } = useRequestDetailSheet();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data } = await supabase
      .from('approval_history')
      .select(`
        *,
        profile:profiles(full_name),
        request:material_requests(id, request_no, project_name, requested_by)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    const lastReadAt = getLastReadAt(profile.id);
    const mapped = mapHistoryToNotifications(
      (data ?? []) as HistoryWithRequest[],
      profile,
      lastReadAt,
    );

    setNotifications(mapped.slice(0, 50));
    setLoading(false);
  }, [profile, supabase]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !profile) return;
    markNotificationsRead(profile.id);
    onRead?.();
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  }, [open, profile, onRead]);

  function handleNotificationClick(notification: AppNotification) {
    onOpenChange(false);

    const refresh = () => load();

    switch (notification.target) {
      case 'approval':
        openApprovalReview(notification.requestId, { onSuccess: refresh });
        break;
      case 'warehouse':
        openWarehouseRelease(notification.requestId, { onSuccess: refresh });
        break;
      case 'confirmation':
        openConfirmationReceipt(notification.requestId, { onSuccess: refresh });
        break;
      default:
        openRequestDetail(notification.requestId, { onUpdated: refresh });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0">
        <SheetHeader className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="text-lg">Notifications</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {profile?.role === 'admin'
                  ? 'All activity across requests, approvals, and warehouse'
                  : 'Updates relevant to your role'}
              </SheetDescription>
            </div>
            <SheetCloseButton />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <PageLoader />
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <Bell size={22} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No notifications</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                You&apos;re all caught up. New activity will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {notifications.map(notification => {
                const categoryStyle = CATEGORY_STYLES[notification.category];
                const Icon = ACTION_ICONS[notification.action] ?? categoryStyle.icon;

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        'w-full text-left px-5 py-4 hover:bg-white/5 transition-colors',
                        notification.unread && 'bg-brand-500/5',
                      )}
                    >
                      <div className="flex gap-3">
                        <div
                          className={cn(
                            'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                            categoryStyle.color.split(' ')[1],
                          )}
                        >
                          <Icon size={16} className={categoryStyle.color.split(' ')[0]} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">
                              {notification.title}
                            </p>
                            {notification.unread && (
                              <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {notification.requestNo} · {notification.projectName}
                          </p>
                          {notification.subtitle !== `${notification.requestNo} · ${notification.projectName}` && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic line-clamp-2">
                              &quot;{notification.subtitle}&quot;
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                            <span className="badge text-[10px] px-2 py-0.5 bg-white/5 text-gray-400 border border-white/10">
                              {getCategoryLabel(notification.category)}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {notification.actorName}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {formatDateTime(notification.createdAt)} · {timeAgo(notification.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
