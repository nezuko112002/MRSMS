'use client';

import { NewRequestModalProvider } from '@/hooks/useNewRequestModal';
import { ApprovalReviewSheetProvider } from '@/hooks/useApprovalReviewSheet';
import { RequestDetailSheetProvider } from '@/hooks/useRequestDetailSheet';
import { WarehouseReleaseSheetProvider } from '@/hooks/useWarehouseReleaseSheet';
import { ConfirmationReceiptSheetProvider } from '@/hooks/useConfirmationReceiptSheet';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ApprovalReviewSheetProvider>
      <RequestDetailSheetProvider>
        <WarehouseReleaseSheetProvider>
          <ConfirmationReceiptSheetProvider>
            <NewRequestModalProvider>
              {children}
            </NewRequestModalProvider>
          </ConfirmationReceiptSheetProvider>
        </WarehouseReleaseSheetProvider>
      </RequestDetailSheetProvider>
    </ApprovalReviewSheetProvider>
  );
}
