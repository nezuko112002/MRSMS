'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { NotificationsSheet } from '@/components/notifications/NotificationsSheet';
import {
  type HistoryWithRequest,
  getLastReadAt,
  mapHistoryToNotifications,
} from '@/lib/notifications';

interface NotificationsSheetContextValue {
  openNotifications: () => void;
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
}

const NotificationsSheetContext = createContext<NotificationsSheetContextValue | null>(null);

export function NotificationsSheetProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshNotifications = useCallback(async () => {
    if (!profile) {
      setUnreadCount(0);
      return;
    }

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
    const notifications = mapHistoryToNotifications(
      (data ?? []) as HistoryWithRequest[],
      profile,
      lastReadAt,
    );

    setUnreadCount(notifications.filter(n => n.unread).length);
  }, [profile, supabase]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!profile) return;

    const interval = window.setInterval(refreshNotifications, 60_000);
    const onFocus = () => refreshNotifications();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [profile, refreshNotifications]);

  const openNotifications = useCallback(() => {
    setOpen(true);
  }, []);

  const handleRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <NotificationsSheetContext.Provider
      value={{ openNotifications, unreadCount, refreshNotifications }}
    >
      {children}
      <NotificationsSheet
        open={open}
        onOpenChange={setOpen}
        onRead={handleRead}
      />
    </NotificationsSheetContext.Provider>
  );
}

export function useNotificationsSheet() {
  const ctx = useContext(NotificationsSheetContext);
  if (!ctx) {
    throw new Error('useNotificationsSheet must be used within NotificationsSheetProvider');
  }
  return ctx;
}
