'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { WarehouseReleaseSheet } from '@/components/warehouse/WarehouseReleaseSheet';

interface OpenOptions {
  onSuccess?: () => void;
}

interface WarehouseReleaseSheetContextValue {
  openWarehouseRelease: (requestId: string, options?: OpenOptions) => void;
}

const WarehouseReleaseSheetContext = createContext<WarehouseReleaseSheetContextValue | null>(null);

export function WarehouseReleaseSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const onSuccessRef = useRef<(() => void) | undefined>();

  const openWarehouseRelease = useCallback((id: string, options?: OpenOptions) => {
    setRequestId(id);
    onSuccessRef.current = options?.onSuccess;
    setOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    onSuccessRef.current?.();
    onSuccessRef.current = undefined;
  }, []);

  return (
    <WarehouseReleaseSheetContext.Provider value={{ openWarehouseRelease }}>
      {children}
      <WarehouseReleaseSheet
        open={open}
        requestId={requestId}
        onOpenChange={setOpen}
        onSuccess={handleSuccess}
      />
    </WarehouseReleaseSheetContext.Provider>
  );
}

export function useWarehouseReleaseSheet() {
  const ctx = useContext(WarehouseReleaseSheetContext);
  if (!ctx) {
    throw new Error('useWarehouseReleaseSheet must be used within WarehouseReleaseSheetProvider');
  }
  return ctx;
}
