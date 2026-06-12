'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetCloseButton,
} from '@/components/ui/sheet';
import { RequestStatusWithItems, ItemProgressBadges, ItemStatusBadge } from '@/components/ui/StatusBadge';
import { ApprovalTimeline } from '@/components/ui/ApprovalTimeline';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { formatDate, formatNumber, requestNeedsApprovalReview, computeRequestStatusFromItems, getInitialItemReviewAction } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem, ApprovalHistory } from '@/types';
import { CheckCircle, XCircle, AlertCircle, Info, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';
import { notifyLiveDataChange } from '@/lib/liveData';

interface ItemReview {
  id: string;
  approved_qty: number | '';
  reject_reason: string;
  action: 'approve' | 'reject' | 'pending';
}

interface ApprovalReviewSheetProps {
  open: boolean;
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ApprovalReviewSheet({ open, requestId, onOpenChange, onSuccess }: ApprovalReviewSheetProps) {
  const { profile } = useAuth();
  const supabase = createClient();

  const [request, setRequest] = useState<MaterialRequest & { profile?: { full_name: string; department: string | null } } | null>(null);
  const [items, setItems] = useState<MaterialRequestItem[]>([]);
  const [history, setHistory] = useState<ApprovalHistory[]>([]);
  const [reviews, setReviews] = useState<ItemReview[]>([]);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setRequest(null);
    setItems([]);
    setHistory([]);
    setReviews([]);
    setComments('');
    setLoading(false);
    setSubmitting(false);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!requestId) return;
    if (!opts?.silent) setLoading(true);
    const [reqRes, itemsRes, histRes] = await Promise.all([
      supabase.from('material_requests').select('*, profile:profiles(full_name, department)').eq('id', requestId).single(),
      supabase.from('material_request_items').select('*').eq('request_id', requestId).order('sort_order'),
      supabase.from('approval_history').select('*, profile:profiles(full_name)').eq('request_id', requestId).order('created_at'),
    ]);
    setRequest(reqRes.data);
    const its = (itemsRes.data ?? []) as MaterialRequestItem[];
    setItems(its);
    setReviews(its.map(i => ({
      id: i.id,
      approved_qty: i.approved_qty ?? i.requested_qty,
      reject_reason: i.reject_reason || '',
      action: getInitialItemReviewAction(i),
    })));
    setHistory(histRes.data || []);
    setLoading(false);
  }, [requestId, supabase]);

  useEffect(() => {
    if (open && requestId) {
      load();
    } else if (!open) {
      reset();
    }
  }, [open, requestId, load, reset]);

  useAutoRefresh(() => {
    if (open && requestId) void load({ silent: true });
  }, open && !!requestId);

  function updateReview(id: string, field: keyof ItemReview, value: ItemReview[keyof ItemReview]) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  async function handleApprove(rejectAll = false) {
    if (!request || !profile) return;

    if (!rejectAll) {
      const rejectedWithoutReason = reviews.filter(r => {
        const current = items.find(i => i.id === r.id);
        return r.action === 'reject' && (!current || current.status === 'pending') && !r.reject_reason.trim();
      });
      if (rejectedWithoutReason.length > 0) {
        toast.error('Please provide a reason for rejected items');
        return;
      }
    }

    setSubmitting(true);
    try {
      const decidedItemIds = new Set(
        rejectAll
          ? reviews.map(r => r.id)
          : reviews
              .filter(r => {
                const current = items.find(i => i.id === r.id);
                return !current || current.status === 'pending';
              })
              .map(r => r.id)
      );

      const reviewById = new Map(
        (rejectAll
          ? reviews.map(r => ({ id: r.id, status: 'rejected' as const, reject_reason: comments || 'Rejected by manager', approved_qty: 0 }))
          : reviews.map(r => {
              if (r.action === 'approve') {
                return { id: r.id, approved_qty: Number(r.approved_qty), status: 'approved' as const, reject_reason: null };
              }
              if (r.action === 'reject') {
                return { id: r.id, approved_qty: 0, status: 'rejected' as const, reject_reason: r.reject_reason };
              }
              return { id: r.id, approved_qty: null, status: 'pending' as const, reject_reason: null };
            })
        ).map(u => [u.id, u])
      );

      for (const item of items) {
        if (!decidedItemIds.has(item.id)) continue;
        const u = reviewById.get(item.id);
        if (!u) continue;
        await supabase.from('material_request_items').update({
          approved_qty: u.approved_qty,
          status: u.status,
          reject_reason: u.reject_reason,
        }).eq('id', item.id);
      }

      const finalItems = items.map(item => {
        const u = decidedItemIds.has(item.id) ? reviewById.get(item.id) : undefined;
        return {
          status: u?.status ?? item.status,
          purpose: item.purpose,
          approved_qty: u?.approved_qty ?? item.approved_qty,
          released_qty: item.released_qty,
          requested_qty: item.requested_qty,
          release_deferred: item.release_deferred,
        };
      });

      const newStatus: MaterialRequest['status'] = rejectAll
        ? 'rejected'
        : computeRequestStatusFromItems(finalItems);

      await supabase.from('material_requests').update({ status: newStatus }).eq('id', request.id);
      const reviewedItems = items
        .filter(item => {
          if (!decidedItemIds.has(item.id)) return false;
          if (rejectAll) return true;
          const decision = reviewById.get(item.id);
          return decision?.status === 'approved' || decision?.status === 'rejected';
        })
        .map(item => ({ sort_order: item.sort_order, description: item.description }));

      const historyAction = rejectAll
        ? 'rejected'
        : newStatus === 'approved'
          ? 'approved'
          : newStatus === 'rejected'
            ? 'rejected'
            : 'partially_approved';

      await supabase.from('approval_history').insert({
        request_id: request.id,
        action_by: profile.id,
        action: historyAction,
        from_status: request.status,
        to_status: newStatus,
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(reviewedItems),
          message: comments.trim() || null,
        }),
      });

      const stillPending = finalItems.filter(item => item.status === 'pending').length;
      const successMessage = rejectAll
        ? 'Request rejected'
        : newStatus === 'partially_approved' && stillPending > 0
          ? 'Approved items sent to warehouse. Remaining items stay pending for review.'
          : newStatus === 'pending'
            ? 'Review saved — request remains pending'
            : `Request ${newStatus.replace('_', ' ')}`;
      notifyLiveDataChange(supabase);
      toast.success(successMessage);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error processing approval');
    } finally {
      setSubmitting(false);
    }
  }

  const canReview =
    (profile?.role === 'manager' || profile?.role === 'admin') &&
    requestNeedsApprovalReview(request, items);
  const canEditItem = (item: MaterialRequestItem) => canReview && item.status === 'pending';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 sm:max-w-2xl flex flex-col h-full">
        <SheetCloseButton />

        {(loading || !request) && (
          <SheetTitle className="sr-only">Approval review</SheetTitle>
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
                <RequestStatusWithItems request={request} items={items} />
                <ItemProgressBadges items={items} />
              </div>
              <SheetDescription>Review items and submit your approval decision.</SheetDescription>
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
                  <p className="text-xs text-gray-400">Required Date</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatDate(request.required_date)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Purpose</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{request.purpose}</p>
                </div>
              </div>

              {canReview && (
                <div className="flex gap-2 p-3 rounded-xl border-l-4 border-amber-500 bg-amber-500/5">
                  <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Approved items go to warehouse right away. Use <strong>Pending</strong> to defer items that still need a decision.
                  </p>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Item Review</h3>
                <div className="space-y-3">
                  {items.map((item, i) => {
                    const review = reviews.find(r => r.id === item.id);
                    if (!review) return null;
                    return (
                      <div key={item.id} className="p-4 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-xs text-gray-400 font-mono mr-2">#{i + 1}</span>
                            <span className="font-medium text-gray-800 dark:text-gray-200">{item.description}</span>
                            {item.purpose && <p className="text-xs text-gray-400 mt-0.5 italic">{item.purpose}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-400">Requested</p>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">{formatNumber(item.requested_qty)} {item.unit}</p>
                          </div>
                        </div>

                        {canEditItem(item) && (
                          <div className="flex flex-col gap-3">
                            <div className="flex rounded-xl overflow-hidden border border-white/20 dark:border-white/10 w-fit">
                              <button
                                type="button"
                                onClick={() => updateReview(item.id, 'action', 'approve')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                  review.action === 'approve'
                                    ? 'bg-emerald-500 text-white'
                                    : 'text-gray-500 hover:bg-white/30 dark:hover:bg-white/5'
                                }`}
                              >
                                <CheckCircle size={13} /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => updateReview(item.id, 'action', 'reject')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                  review.action === 'reject'
                                    ? 'bg-red-500 text-white'
                                    : 'text-gray-500 hover:bg-white/30 dark:hover:bg-white/5'
                                }`}
                              >
                                <XCircle size={13} /> Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => updateReview(item.id, 'action', 'pending')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                  review.action === 'pending'
                                    ? 'bg-amber-500 text-white'
                                    : 'text-gray-500 hover:bg-white/30 dark:hover:bg-white/5'
                                }`}
                              >
                                <Clock size={13} /> Pending
                              </button>
                            </div>

                            {review.action === 'approve' && (
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-xs text-gray-400">Approved Qty:</label>
                                <input
                                  type="number"
                                  value={review.approved_qty}
                                  onChange={e => updateReview(item.id, 'approved_qty', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="glass-input w-28 text-sm"
                                  min="0"
                                  max={item.requested_qty}
                                  step="0.01"
                                />
                                <span className="text-xs text-gray-400">{item.unit}</span>
                                {Number(review.approved_qty) < item.requested_qty && review.approved_qty !== '' && (
                                  <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                    <AlertCircle size={11} /> Adjusted
                                  </span>
                                )}
                              </div>
                            )}

                            {review.action === 'reject' && (
                              <input
                                type="text"
                                value={review.reject_reason}
                                onChange={e => updateReview(item.id, 'reject_reason', e.target.value)}
                                className="glass-input text-sm"
                                placeholder="Reason for rejection *"
                              />
                            )}

                            {review.action === 'pending' && (
                              <p className="text-xs text-amber-400/90">
                                This item will stay pending until you approve or reject it on a later review.
                              </p>
                            )}
                          </div>
                        )}

                        {!canEditItem(item) && (
                          <div className="flex flex-wrap items-center gap-4">
                            <ItemStatusBadge item={item} />
                            {item.status === 'approved' && item.approved_qty != null && (
                              <div>
                                <p className="text-xs text-gray-400">Approved Qty</p>
                                <p className="font-medium text-emerald-400">
                                  {formatNumber(item.approved_qty)} {item.unit}
                                </p>
                              </div>
                            )}
                            {item.reject_reason && (
                              <div>
                                <p className="text-xs text-gray-400">Reject Reason</p>
                                <p className="text-sm text-red-400">{item.reject_reason}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {history.length > 0 && (
                <div className="pb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Activity</h3>
                  <ApprovalTimeline history={history} items={items} />
                </div>
              )}
            </div>

            {canReview && (
              <SheetFooter className="flex-col sm:flex-col gap-3">
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  rows={2}
                  className="glass-input resize-none w-full"
                  placeholder="Overall comments (optional)..."
                />
                <div className="flex flex-wrap justify-end gap-2 w-full">
                  {request.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(true)}
                      className="btn-danger"
                      disabled={submitting}
                    >
                      <XCircle size={16} /> Reject All
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleApprove(false)}
                    className="btn-success"
                    disabled={submitting}
                  >
                    <CheckCircle size={16} />
                    {submitting ? 'Processing...' : 'Submit Review'}
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
