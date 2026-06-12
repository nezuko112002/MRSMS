'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { bindLiveDataBroadcast } from '@/lib/liveData';
import { REALTIME_TABLES } from '@/lib/realtimeTables';

type Listener = () => void;
type Unsubscribe = () => void;

interface LiveDataContextValue {
  subscribe: (listener: Listener) => Unsubscribe;
}

const LiveDataContext = createContext<LiveDataContextValue | null>(null);

const POLL_MS = 5_000;

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<Listener>());

  const subscribe = useCallback((listener: Listener): Unsubscribe => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let dbChannel: RealtimeChannel | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const notifyAll = () => {
      listenersRef.current.forEach(listener => listener());
    };

    const teardownDbChannel = async () => {
      if (!dbChannel) return;
      await supabase.removeChannel(dbChannel);
      dbChannel = null;
    };

    const bindDbChannel = async () => {
      if (cancelled) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      await supabase.realtime.setAuth(session?.access_token ?? null);
      await teardownDbChannel();
      if (cancelled) return;

      const next = supabase.channel('mrsms-live-data');
      for (const table of REALTIME_TABLES) {
        next.on('postgres_changes', { event: '*', schema: 'public', table }, notifyAll);
      }
      next.subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
        if (status === 'CHANNEL_ERROR' && !cancelled) {
          retryTimer = setTimeout(() => void bindDbChannel(), 2000);
        }
      });
      dbChannel = next;
    };

    const unbindBroadcast = bindLiveDataBroadcast(supabase, notifyAll);
    void bindDbChannel();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void bindDbChannel();
    });

    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') notifyAll();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') notifyAll();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', notifyAll);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.clearInterval(pollInterval);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', notifyAll);
      unbindBroadcast();
      void teardownDbChannel();
    };
  }, []);

  return (
    <LiveDataContext.Provider value={{ subscribe }}>
      {children}
    </LiveDataContext.Provider>
  );
}

export function useLiveDataSubscribe() {
  return useContext(LiveDataContext);
}
