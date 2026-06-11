'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { NewRequestModal } from '@/components/requests/NewRequestModal';
import { useRequestDetailSheet } from '@/hooks/useRequestDetailSheet';

interface OpenOptions {
  onSuccess?: () => void;
}

interface NewRequestModalContextValue {
  openNewRequest: (options?: OpenOptions) => void;
}

const NewRequestModalContext = createContext<NewRequestModalContextValue | null>(null);

function NewRequestModalBridge({
  open,
  setOpen,
  onSuccessRef,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onSuccessRef: React.MutableRefObject<(() => void) | undefined>;
}) {
  const { openRequestDetail } = useRequestDetailSheet();

  const handleSuccess = useCallback(
    (requestId: string) => {
      const refresh = onSuccessRef.current;
      onSuccessRef.current = undefined;
      refresh?.();
      openRequestDetail(requestId, { onUpdated: refresh });
    },
    [openRequestDetail, onSuccessRef]
  );

  return <NewRequestModal open={open} onOpenChange={setOpen} onSuccess={handleSuccess} />;
}

export function NewRequestModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const onSuccessRef = useRef<(() => void) | undefined>();

  const openNewRequest = useCallback((options?: OpenOptions) => {
    onSuccessRef.current = options?.onSuccess;
    setOpen(true);
  }, []);

  return (
    <NewRequestModalContext.Provider value={{ openNewRequest }}>
      {children}
      <NewRequestModalBridge open={open} setOpen={setOpen} onSuccessRef={onSuccessRef} />
    </NewRequestModalContext.Provider>
  );
}

export function useNewRequestModal() {
  const ctx = useContext(NewRequestModalContext);
  if (!ctx) {
    throw new Error('useNewRequestModal must be used within NewRequestModalProvider');
  }
  return ctx;
}
