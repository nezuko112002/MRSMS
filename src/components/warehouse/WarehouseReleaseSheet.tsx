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
import { Package, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';

interface ReleaseItem {
  item: MaterialRequestItem;
  released_qty: number | '';
}

interface WarehouseReleaseSheetProps {
  open: boolean;
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function WarehouseReleaseSheet({ open, requestId, onOpenChange, onSuccess }: WarehouseReleaseSheetProps) {
  const { profile } = useAuth();
  const supabase = createClient();

  const [request, setRequest] = useState<MaterialRequest & { profile?: { full_name: string } } | null>(null);
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setRequest(null);
    setReleaseItems([]);
    setNotes('');
    setLoading(false);
    setSubmitting(false);
  }, []);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    const [reqRes, itemsRes] = await Promise.all([
      supabase.from('material_requests').select('*, profile:profiles(full_name)').eq('id', requestId).single(),
      supabase.from('material_request_items').select('*').eq('request_id', requestId).in('status', ['approved']).order('sort_order'),
    ]);

    const its = itemsRes.data || [];
    setRequest(reqRes.data);
    setReleaseItems(its.map(item => ({
      item,
      released_qty: item.approved_qty || item.requested_qty,
    })));
    setLoading(false);
  }, [requestId, supabase]);

  useEffect(() => {
    if (open && requestId) {
      load();
    } else if (!open) {
      reset();
    }
  }, [open, requestId, load, reset]);

  function updateQty(itemId: string, qty: number | '') {
    setReleaseItems(prev => prev.map(c =>
      c.item.id === itemId ? { ...c, released_qty: qty } : c
    ));
  }

  async function handleRelease() {
    if (!request || !profile) return;
    if (releaseItems.length === 0) {
      toast.error('No approved items to release');
      return;
    }

    const invalid = releaseItems.filter(c => c.released_qty === '' || Number(c.released_qty) < 0);
    if (invalid.length) {
      toast.error('Please enter valid release quantities');
      return;
    }

    setSubmitting(true);
    try {
      const { data: slip, error: slipErr } = await supabase.from('material_release_slips').insert({
        request_id: request.id,
        released_by: profile.id,
        notes: notes.trim() || null,
        status: releaseItems.some(c => Number(c.released_qty) < (c.item.approved_qty || c.item.requested_qty))
          ? 'partial' : 'complete',
      }).select().single();

      if (slipErr) throw slipErr;

      for (const entry of releaseItems) {
        const relQty = Number(entry.released_qty);
        await supabase.from('material_request_items').update({
          released_qty: relQty,
          status: 'released',
        }).eq('id', entry.item.id);
      }

      const { data: allItems } = await supabase
        .from('material_request_items')
        .select('status')
        .eq('request_id', request.id);

      const newStatus = computeRequestStatusFromItems(allItems || []);
      await supabase.from('material_requests').update({ status: newStatus }).eq('id', request.id);

      await supabase.from('approval_history').insert({
        request_id: request.id,
        action_by: profile.id,
        action: 'released',
        from_status: request.status,
        to_status: newStatus,
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(releaseItems.map(e => ({
            sort_order: e.item.sort_order,
            description: e.item.description,
          }))),
          message: `Release Slip: ${slip.slip_no}`,
        }),
      });

      toast.success(`Materials released — ${slip.slip_no}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Release failed');
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
              <SheetDescription>Enter release quantities for approved items.</SheetDescription>
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
                <div>
                  <p className="text-xs text-gray-400">Requested By</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{request.profile?.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Required By</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatDate(request.required_date)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <Package size={14} className="text-violet-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Material Release</h3>
                </div>

                {releaseItems.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 p-4 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10">
                    No approved items are ready for release on this request.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {releaseItems.map(entry => {
                      const approvedQty = entry.item.approved_qty || entry.item.requested_qty;
                      return (
                        <div key={entry.item.id} className="p-4 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 space-y-3">
                          <p className="font-medium text-gray-800 dark:text-gray-200">{entry.item.description}</p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-gray-400">Approved Qty</p>
                              <p className="font-semibold text-emerald-400">{formatNumber(approvedQty)} {entry.item.unit}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Release Qty *</p>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={entry.released_qty}
                                  onChange={e => updateQty(entry.item.id, e.target.value === '' ? '' : Number(e.target.value))}
                                  min="0"
                                  max={approvedQty}
                                  step="0.01"
                                  className="glass-input w-28 text-sm"
                                />
                                <span className="text-xs text-gray-400">{entry.item.unit}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {releaseItems.length > 0 && (
              <SheetFooter className="flex-col sm:flex-col gap-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="glass-input resize-none w-full"
                  placeholder="Release notes (optional)..."
                />
                <div className="flex flex-wrap justify-end gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleRelease}
                    className="btn-primary w-full sm:w-auto justify-center"
                    disabled={submitting}
                  >
                    <Truck size={16} />
                    {submitting ? 'Processing...' : 'Release Materials'}
                  </button>
                </div>
              </SheetFooter>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
