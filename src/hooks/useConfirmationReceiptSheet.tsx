'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmationReceiptSheet } from '@/components/confirmations/ConfirmationReceiptSheet';

interface OpenOptions {
  onSuccess?: () => void;
}

interface ConfirmationReceiptSheetContextValue {
  openConfirmationReceipt: (requestId: string, options?: OpenOptions) => void;
}

const ConfirmationReceiptSheetContext = createContext<ConfirmationReceiptSheetContextValue | null>(null);

export function ConfirmationReceiptSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const onSuccessRef = useRef<(() => void) | undefined>();

  const openConfirmationReceipt = useCallback((id: string, options?: OpenOptions) => {
    setRequestId(id);
    onSuccessRef.current = options?.onSuccess;
    setOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    onSuccessRef.current?.();
    onSuccessRef.current = undefined;
  }, []);

  return (
    <ConfirmationReceiptSheetContext.Provider value={{ openConfirmationReceipt }}>
      {children}
      <ConfirmationReceiptSheet
        open={open}
        requestId={requestId}
        onOpenChange={setOpen}
        onSuccess={handleSuccess}
      />
    </ConfirmationReceiptSheetContext.Provider>
  );
}

export function useConfirmationReceiptSheet() {
  const ctx = useContext(ConfirmationReceiptSheetContext);
  if (!ctx) {
    throw new Error('useConfirmationReceiptSheet must be used within ConfirmationReceiptSheetProvider');
  }
  return ctx;
}
