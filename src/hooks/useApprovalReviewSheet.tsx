'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ApprovalReviewSheet } from '@/components/approvals/ApprovalReviewSheet';

interface OpenOptions {
  onSuccess?: () => void;
}

interface ApprovalReviewSheetContextValue {
  openApprovalReview: (requestId: string, options?: OpenOptions) => void;
}

const ApprovalReviewSheetContext = createContext<ApprovalReviewSheetContextValue | null>(null);

export function ApprovalReviewSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const onSuccessRef = useRef<(() => void) | undefined>();

  const openApprovalReview = useCallback((id: string, options?: OpenOptions) => {
    setRequestId(id);
    onSuccessRef.current = options?.onSuccess;
    setOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    onSuccessRef.current?.();
    onSuccessRef.current = undefined;
  }, []);

  return (
    <ApprovalReviewSheetContext.Provider value={{ openApprovalReview }}>
      {children}
      <ApprovalReviewSheet
        open={open}
        requestId={requestId}
        onOpenChange={setOpen}
        onSuccess={handleSuccess}
      />
    </ApprovalReviewSheetContext.Provider>
  );
}

export function useApprovalReviewSheet() {
  const ctx = useContext(ApprovalReviewSheetContext);
  if (!ctx) {
    throw new Error('useApprovalReviewSheet must be used within ApprovalReviewSheetProvider');
  }
  return ctx;
}
