'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetCloseButton,
} from '@/components/ui/sheet';
import { RequestStatusBadge } from '@/components/ui/StatusBadge';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { formatDate, formatNumber, computeRequestStatusFromItems } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem } from '@/types';
import { ClipboardCheck, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';

interface ConfirmationReceiptSheetProps {
  open: boolean;
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ConfirmationReceiptSheet({ open, requestId, onOpenChange, onSuccess }: ConfirmationReceiptSheetProps) {
  const { profile } = useAuth();
  const supabase = createClient();

  const [request, setRequest] = useState<MaterialRequest | null>(null);
  const [items, setItems] = useState<MaterialRequestItem[]>([]);
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setRequest(null);
    setItems([]);
    setReceivedQtys({});
    setConditions({});
    setLoading(false);
    setSubmitting(false);
  }, []);

  const load = useCallback(async () => {
    if (!requestId || !profile) return;
    setLoading(true);

    const [reqRes, itemsRes] = await Promise.all([
      supabase.from('material_requests').select('*').eq('id', requestId).single(),
      supabase.from('material_request_items')
        .select('*')
        .eq('request_id', requestId)
        .eq('status', 'released')
        .order('sort_order'),
    ]);

    const its = (itemsRes.data ?? []) as MaterialRequestItem[];
    const initQtys: Record<string, number> = {};
    const initCond: Record<string, string> = {};
    its.forEach(i => {
      initQtys[i.id] = i.released_qty || 0;
      initCond[i.id] = 'good';
    });

    setRequest(reqRes.data);
    setItems(its);
    setReceivedQtys(initQtys);
    setConditions(initCond);
    setLoading(false);
  }, [requestId, profile, supabase]);

  useEffect(() => {
    if (open && requestId) {
      load();
    } else if (!open) {
      reset();
    }
  }, [open, requestId, load, reset]);

  async function handleConfirm() {
    if (!requestId || !request || !profile) return;
    if (items.length === 0) {
      toast.error('No released items to confirm');
      return;
    }

    setSubmitting(true);
    try {
      for (const item of items) {
        await supabase.from('material_request_items').update({
          received_qty: receivedQtys[item.id] || 0,
          status: 'received',
        }).eq('id', item.id);
      }

      const { data: allItems } = await supabase
        .from('material_request_items')
        .select('status')
        .eq('request_id', requestId);

      const newStatus = computeRequestStatusFromItems(allItems || []);
      await supabase.from('material_requests').update({ status: newStatus }).eq('id', requestId);

      await supabase.from('approval_history').insert({
        request_id: requestId,
        action_by: profile.id,
        action: 'confirmed',
        from_status: request.status,
        to_status: newStatus,
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(items.map(i => ({ sort_order: i.sort_order, description: i.description }))),
        }),
      });

      toast.success('Receipt confirmed!');
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error confirming receipt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 sm:max-w-2xl flex flex-col h-full">
        <SheetCloseButton />

        {loading || !request ? (
          <div className="flex items-center justify-center h-full">
            <PageLoader />
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2 pr-2">
                <SheetTitle className="font-mono">{request.request_no}</SheetTitle>
                <RequestStatusBadge status={request.status} />
              </div>
              <SheetDescription>Verify quantities received and their condition.</SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10">
                <div>
                  <p className="text-xs text-gray-400">Project</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{request.project_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Department</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{request.department}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Required By</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatDate(request.required_date)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/15 flex items-center justify-center">
                    <ClipboardCheck size={14} className="text-teal-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Confirm Receipt</h3>
                </div>

                {items.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 p-4 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10">
                    No released items are waiting for confirmation on this request.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {items.map(item => (
                      <div key={item.id} className="p-4 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-gray-800 dark:text-gray-200">{item.description}</p>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-400">Released</p>
                            <p className="font-semibold text-violet-400">
                              {formatNumber(item.released_qty || 0)} {item.unit}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-gray-400">Received Qty</label>
                            <input
                              type="number"
                              value={receivedQtys[item.id] ?? item.released_qty ?? 0}
                              onChange={e => setReceivedQtys(p => ({ ...p, [item.id]: Number(e.target.value) }))}
                              min="0"
                              max={item.released_qty || 0}
                              step="0.01"
                              className="glass-input text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-400">Condition</label>
                            <select
                              value={conditions[item.id] || 'good'}
                              onChange={e => setConditions(p => ({ ...p, [item.id]: e.target.value }))}
                              className="glass-select text-sm"
                            >
                              <option value="good">Good</option>
                              <option value="damaged">Damaged</option>
                              <option value="incomplete">Incomplete</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <SheetFooter>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="btn-success w-full sm:w-auto justify-center"
                  disabled={submitting}
                >
                  <CheckCircle size={16} />
                  {submitting ? 'Confirming...' : 'Confirm Receipt'}
                </button>
              </SheetFooter>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
