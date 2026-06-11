'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { RequestDetailSheet } from '@/components/requests/RequestDetailSheet';

interface OpenOptions {
  onUpdated?: () => void;
}

interface RequestDetailSheetContextValue {
  openRequestDetail: (requestId: string, options?: OpenOptions) => void;
}

const RequestDetailSheetContext = createContext<RequestDetailSheetContextValue | null>(null);

export function RequestDetailSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const onUpdatedRef = useRef<(() => void) | undefined>();

  const openRequestDetail = useCallback((id: string, options?: OpenOptions) => {
    setRequestId(id);
    onUpdatedRef.current = options?.onUpdated;
    setOpen(true);
  }, []);

  const handleUpdated = useCallback(() => {
    onUpdatedRef.current?.();
  }, []);

  return (
    <RequestDetailSheetContext.Provider value={{ openRequestDetail }}>
      {children}
      <RequestDetailSheet
        open={open}
        requestId={requestId}
        onOpenChange={setOpen}
        onUpdated={handleUpdated}
      />
    </RequestDetailSheetContext.Provider>
  );
}

export function useRequestDetailSheet() {
  const ctx = useContext(RequestDetailSheetContext);
  if (!ctx) {
    throw new Error('useRequestDetailSheet must be used within RequestDetailSheetProvider');
  }
  return ctx;
}
