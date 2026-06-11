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
import { Package, Truck, XCircle, Clock, AlertCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';
import {
  isWarehouseDeferred,
  markWarehouseDeferred,
  clearWarehouseDeferredMarker,
} from '@/lib/warehouseDeferred';

interface ReleaseItem {
  item: MaterialRequestItem;
  released_qty: number | '';
  reject_reason: string;
  action: 'release' | 'reject' | 'pending';
}

interface WarehouseReleaseDraft {
  notes: string;
  items: Record<string, Pick<ReleaseItem, 'action' | 'released_qty' | 'reject_reason'>>;
}

function draftKey(requestId: string) {
  return `matreq-warehouse-draft:${requestId}`;
}

function readDraft(requestId: string): WarehouseReleaseDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(draftKey(requestId));
    return raw ? JSON.parse(raw) as WarehouseReleaseDraft : null;
  } catch {
    return null;
  }
}

function writeDraft(requestId: string, draft: WarehouseReleaseDraft) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(draftKey(requestId), JSON.stringify(draft));
}

function clearDraft(requestId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(draftKey(requestId));
}

function buildReleaseItems(
  items: MaterialRequestItem[],
  draft: WarehouseReleaseDraft | null
): ReleaseItem[] {
  return items.map(item => {
    const saved = draft?.items[item.id];
    const deferred = isWarehouseDeferred(item);
    const action = deferred ? 'pending' : (saved?.action ?? 'release');
    return {
      item,
      released_qty: saved?.released_qty ?? item.approved_qty ?? item.requested_qty,
      reject_reason: saved?.reject_reason ?? item.reject_reason ?? '',
      action,
    };
  });
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

    const its = (itemsRes.data ?? []) as MaterialRequestItem[];
    const draft = requestId ? readDraft(requestId) : null;
    setRequest(reqRes.data);
    setReleaseItems(buildReleaseItems(its, draft));
    setNotes(draft?.notes ?? '');
    setLoading(false);
  }, [requestId, supabase]);

  useEffect(() => {
    if (open && requestId) {
      load();
    } else if (!open) {
      reset();
    }
  }, [open, requestId, load, reset]);

  function saveDraftSnapshot(items: ReleaseItem[], draftNotes: string) {
    if (!requestId) return;
    writeDraft(requestId, {
      notes: draftNotes,
      items: Object.fromEntries(items.map(entry => [
        entry.item.id,
        {
          action: entry.action,
          released_qty: entry.released_qty,
          reject_reason: entry.reject_reason,
        },
      ])),
    });
  }

  function updateEntry(itemId: string, field: keyof ReleaseItem, value: ReleaseItem[keyof ReleaseItem]) {
    setReleaseItems(prev => {
      const next = prev.map(c =>
        c.item.id === itemId ? { ...c, [field]: value } : c
      );
      saveDraftSnapshot(next, notes);
      return next;
    });
  }

  function updateNotes(value: string) {
    setNotes(value);
    saveDraftSnapshot(releaseItems, value);
  }

  async function persistPendingDeferrals(entries: ReleaseItem[]) {
    for (const entry of entries) {
      if (entry.action !== 'pending') continue;
      const remarks = markWarehouseDeferred(entry.item.remarks);
      const { error } = await supabase.from('material_request_items').update({
        release_deferred: true,
        remarks,
      }).eq('id', entry.item.id);

      if (error) {
        const { error: fallbackError } = await supabase.from('material_request_items').update({
          remarks,
        }).eq('id', entry.item.id);
        if (fallbackError) throw fallbackError;
      }
    }
  }

  async function handleSubmit() {
    if (!request || !profile) return;
    if (releaseItems.length === 0) {
      toast.error('No approved items to process');
      return;
    }

    const toProcess = releaseItems.filter(e => e.action !== 'pending');
    if (toProcess.length === 0) {
      setSubmitting(true);
      try {
        await persistPendingDeferrals(releaseItems);
        clearDraft(request.id);
        toast.success('Items remain in queue for later release');
        onOpenChange(false);
        onSuccess?.();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to save pending items');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const rejectedWithoutReason = releaseItems.filter(
      e => e.action === 'reject' && !e.reject_reason.trim()
    );
    if (rejectedWithoutReason.length > 0) {
      toast.error('Please provide a reason for rejected items');
      return;
    }

    const toRelease = releaseItems.filter(e => e.action === 'release');
    const invalidRelease = toRelease.filter(
      e => e.released_qty === '' || Number(e.released_qty) < 0
    );
    if (invalidRelease.length) {
      toast.error('Please enter valid release quantities');
      return;
    }

    setSubmitting(true);
    try {
      let slipNo: string | null = null;

      if (toRelease.length > 0) {
        const { data: slip, error: slipErr } = await supabase.from('material_release_slips').insert({
          request_id: request.id,
          released_by: profile.id,
          notes: notes.trim() || null,
          status: toRelease.some(c => Number(c.released_qty) < (c.item.approved_qty || c.item.requested_qty))
            ? 'partial' : 'complete',
        }).select().single();

        if (slipErr) throw slipErr;
        slipNo = slip.slip_no;

        for (const entry of toRelease) {
          const relQty = Number(entry.released_qty);
          const remarks = clearWarehouseDeferredMarker(entry.item.remarks);
          const { error } = await supabase.from('material_request_items').update({
            released_qty: relQty,
            status: 'released',
            release_deferred: false,
            remarks,
          }).eq('id', entry.item.id);
          if (error) {
            const { error: fallbackError } = await supabase.from('material_request_items').update({
              released_qty: relQty,
              status: 'released',
              remarks,
            }).eq('id', entry.item.id);
            if (fallbackError) throw fallbackError;
          }
        }
      }

      for (const entry of releaseItems) {
        if (entry.action !== 'reject') continue;
        const remarks = clearWarehouseDeferredMarker(entry.item.remarks);
        const { error } = await supabase.from('material_request_items').update({
          status: 'rejected',
          reject_reason: entry.reject_reason.trim(),
          released_qty: null,
          release_deferred: false,
          remarks,
        }).eq('id', entry.item.id);
        if (error) {
          const { error: fallbackError } = await supabase.from('material_request_items').update({
            status: 'rejected',
            reject_reason: entry.reject_reason.trim(),
            released_qty: null,
            remarks,
          }).eq('id', entry.item.id);
          if (fallbackError) throw fallbackError;
        }
      }

      await persistPendingDeferrals(releaseItems);

      const { data: allItems } = await supabase
        .from('material_request_items')
        .select('status')
        .eq('request_id', request.id);

      const newStatus = computeRequestStatusFromItems(allItems || []);
      await supabase.from('material_requests').update({ status: newStatus }).eq('id', request.id);

      const processedItems = toProcess.map(e => ({
        sort_order: e.item.sort_order,
        description: e.item.description,
      }));

      const historyMessage = [
        slipNo ? `Release Slip: ${slipNo}` : null,
        notes.trim() || null,
      ].filter(Boolean).join(' — ') || null;

      await supabase.from('approval_history').insert({
        request_id: request.id,
        action_by: profile.id,
        action: toRelease.length > 0 ? 'released' : 'rejected',
        from_status: request.status,
        to_status: newStatus,
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(processedItems),
          message: historyMessage,
        }),
      });

      const stillApproved = (allItems || []).filter(i => i.status === 'approved').length;
      const successMessage = slipNo
        ? stillApproved > 0
          ? `Released — ${slipNo}. Remaining items stay in queue.`
          : `Materials released — ${slipNo}`
        : 'Rejected items updated';
      clearDraft(request.id);
      toast.success(successMessage);
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

        {(loading || !request) && (
          <SheetTitle className="sr-only">Warehouse release</SheetTitle>
        )}

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

              {releaseItems.length > 0 && (
                <div className="flex gap-2 p-3 rounded-xl border-l-4 border-violet-500 bg-violet-500/5">
                  <Info size={16} className="text-violet-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Released items are sent for confirmation. Use <strong>Pending</strong> to defer items that are not ready yet, or <strong>Reject</strong> if they cannot be fulfilled.
                  </p>
                </div>
              )}

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
                          <div>
                            <p className="text-xs text-gray-400">Approved Qty</p>
                            <p className="font-semibold text-emerald-400">{formatNumber(approvedQty)} {entry.item.unit}</p>
                          </div>

                          <div className="flex flex-col gap-3">
                            <div className="flex rounded-xl overflow-hidden border border-white/20 dark:border-white/10 w-fit">
                              <button
                                type="button"
                                onClick={() => updateEntry(entry.item.id, 'action', 'release')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                  entry.action === 'release'
                                    ? 'bg-violet-500 text-white'
                                    : 'text-gray-500 hover:bg-white/30 dark:hover:bg-white/5'
                                }`}
                              >
                                <Truck size={13} /> Release
                              </button>
                              <button
                                type="button"
                                onClick={() => updateEntry(entry.item.id, 'action', 'reject')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                  entry.action === 'reject'
                                    ? 'bg-red-500 text-white'
                                    : 'text-gray-500 hover:bg-white/30 dark:hover:bg-white/5'
                                }`}
                              >
                                <XCircle size={13} /> Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => updateEntry(entry.item.id, 'action', 'pending')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                  entry.action === 'pending'
                                    ? 'bg-amber-500 text-white'
                                    : 'text-gray-500 hover:bg-white/30 dark:hover:bg-white/5'
                                }`}
                              >
                                <Clock size={13} /> Pending
                              </button>
                            </div>

                            {entry.action === 'release' && (
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-xs text-gray-400">Release Qty:</label>
                                <input
                                  type="number"
                                  value={entry.released_qty}
                                  onChange={e => updateEntry(entry.item.id, 'released_qty', e.target.value === '' ? '' : Number(e.target.value))}
                                  min="0"
                                  max={approvedQty}
                                  step="0.01"
                                  className="glass-input w-28 text-sm"
                                />
                                <span className="text-xs text-gray-400">{entry.item.unit}</span>
                                {Number(entry.released_qty) < approvedQty && entry.released_qty !== '' && (
                                  <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                    <AlertCircle size={11} /> Partial
                                  </span>
                                )}
                              </div>
                            )}

                            {entry.action === 'reject' && (
                              <input
                                type="text"
                                value={entry.reject_reason}
                                onChange={e => updateEntry(entry.item.id, 'reject_reason', e.target.value)}
                                className="glass-input text-sm"
                                placeholder="Reason for rejection *"
                              />
                            )}

                            {entry.action === 'pending' && (
                              <p className="text-xs text-amber-400/90">
                                This item will stay in the release queue until you process it later.
                              </p>
                            )}
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
                  onChange={e => updateNotes(e.target.value)}
                  rows={2}
                  className="glass-input resize-none w-full"
                  placeholder="Release notes (optional)..."
                />
                <div className="flex flex-wrap justify-end gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="btn-primary w-full sm:w-auto justify-center"
                    disabled={submitting}
                  >
                    <Truck size={16} />
                    {submitting ? 'Processing...' : 'Submit Release'}
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
