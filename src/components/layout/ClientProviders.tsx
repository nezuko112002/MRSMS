'use client';

import { NewRequestModalProvider } from '@/hooks/useNewRequestModal';
import { ApprovalReviewSheetProvider } from '@/hooks/useApprovalReviewSheet';
import { RequestDetailSheetProvider } from '@/hooks/useRequestDetailSheet';
import { WarehouseReleaseSheetProvider } from '@/hooks/useWarehouseReleaseSheet';
import { ConfirmationReceiptSheetProvider } from '@/hooks/useConfirmationReceiptSheet';
import { NotificationsSheetProvider } from '@/hooks/useNotificationsSheet';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ApprovalReviewSheetProvider>
      <RequestDetailSheetProvider>
        <WarehouseReleaseSheetProvider>
          <ConfirmationReceiptSheetProvider>
            <NotificationsSheetProvider>
              <NewRequestModalProvider>
                {children}
              </NewRequestModalProvider>
            </NotificationsSheetProvider>
          </ConfirmationReceiptSheetProvider>
        </WarehouseReleaseSheetProvider>
      </RequestDetailSheetProvider>
    </ApprovalReviewSheetProvider>
  );
}
