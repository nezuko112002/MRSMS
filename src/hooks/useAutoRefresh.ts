'use client';

import { useEffect, useRef } from 'react';
import { useLiveDataSubscribe } from '@/hooks/LiveDataProvider';

/** Re-run `onRefresh` when request data changes anywhere in the app. */
export function useAutoRefresh(onRefresh: () => void, enabled = true) {
  const liveData = useLiveDataSubscribe();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || !liveData) return;

    const listener = () => onRefreshRef.current();
    return liveData.subscribe(listener);
  }, [enabled, liveData]);
}
