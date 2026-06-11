'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useApprovalReviewSheet } from '@/hooks/useApprovalReviewSheet';
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
import { formatDate, formatNumber, canDeleteRequest, requestNeedsApprovalReview } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem, ApprovalHistory } from '@/types';
import { Calendar, User, Building, FileText, Printer, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';

interface RequestDetailSheetProps {
  open: boolean;
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function RequestDetailSheet({ open, requestId, onOpenChange, onUpdated }: RequestDetailSheetProps) {
  const { profile } = useAuth();
  const { openApprovalReview } = useApprovalReviewSheet();
  const supabase = createClient();

  const [request, setRequest] = useState<MaterialRequest & { profile?: { full_name: string; department: string | null } } | null>(null);
  const [items, setItems] = useState<MaterialRequestItem[]>([]);
  const [history, setHistory] = useState<ApprovalHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setRequest(null);
    setItems([]);
    setHistory([]);
    setLoading(false);
    setSubmitting(false);
  }, []);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    const [reqRes, itemsRes, histRes] = await Promise.all([
      supabase.from('material_requests').select('*, profile:profiles(full_name, department)').eq('id', requestId).single(),
      supabase.from('material_request_items').select('*').eq('request_id', requestId).order('sort_order'),
      supabase.from('approval_history').select('*, profile:profiles(full_name)').eq('request_id', requestId).order('created_at'),
    ]);
    if (reqRes.error) {
      toast.error('Request not found');
      onOpenChange(false);
      return;
    }
    setRequest(reqRes.data);
    setItems(itemsRes.data || []);
    setHistory(histRes.data || []);
    setLoading(false);
  }, [requestId, supabase, onOpenChange]);

  useEffect(() => {
    if (open && requestId) {
      load();
    } else if (!open) {
      reset();
    }
  }, [open, requestId, load, reset]);

  async function handleSubmit() {
    if (!request || !profile) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('material_requests').update({ status: 'pending' }).eq('id', request.id);
      if (error) throw error;
      await supabase.from('approval_history').insert({
        request_id: request.id,
        action_by: profile.id,
        action: 'submitted',
        from_status: 'draft',
        to_status: 'pending',
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(items.map(i => ({ sort_order: i.sort_order, description: i.description }))),
        }),
      });
      toast.success('Request submitted for approval!');
      await load();
      onUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = profile?.id === request?.requested_by && request?.status === 'draft';
  const canApprove =
    (profile?.role === 'manager' || profile?.role === 'admin') &&
    requestNeedsApprovalReview(request, items);
  const canDelete = canDeleteRequest(profile, request);

  async function handleDelete() {
    if (!request || !canDelete) return;
    if (!window.confirm(`Delete ${request.request_no}? This cannot be undone.`)) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('material_requests').delete().eq('id', request.id);
      if (error) throw error;
      toast.success('Request deleted');
      onOpenChange(false);
      onUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete request');
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
                <RequestStatusWithItems request={request} items={items} />
                <ItemProgressBadges items={items} />
              </div>
              <SheetDescription>Request details and item breakdown.</SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10">
                {[
                  { icon: FileText, label: 'Project', value: request.project_name },
                  { icon: Building, label: 'Department', value: request.department },
                  { icon: User, label: 'Requested By', value: request.profile?.full_name },
                  { icon: Calendar, label: 'Required By', value: formatDate(request.required_date) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon size={13} className="text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{value}</p>
                    </div>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-1">Purpose</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{request.purpose}</p>
                </div>
                {request.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{request.notes}</p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">
                  Requested Items
                  <span className="ml-2 badge bg-brand-500/15 text-brand-400 border-brand-500/20">{items.length}</span>
                </h3>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <span className="text-xs text-gray-400 font-mono mr-1">#{i + 1}</span>
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{item.description}</span>
                          {item.remarks && <p className="text-xs text-gray-400 italic mt-0.5">{item.remarks}</p>}
                          {item.reject_reason && (
                            <p className="text-xs text-red-400 mt-0.5">Rejected: {item.reject_reason}</p>
                          )}
                        </div>
                        <ItemStatusBadge status={item.status} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-gray-400">Unit</p>
                          <p className="font-medium text-gray-700 dark:text-gray-300">{item.unit}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Requested</p>
                          <p className="font-medium">{formatNumber(item.requested_qty)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Approved</p>
                          <p className={`font-medium ${item.approved_qty != null && item.approved_qty < item.requested_qty ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {item.approved_qty != null ? formatNumber(item.approved_qty) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">Released</p>
                          <p className="font-medium text-violet-400">
                            {item.released_qty != null ? formatNumber(item.released_qty) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Activity Timeline</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-gray-400">No activity yet.</p>
                ) : (
                  <ApprovalTimeline history={history} items={items} />
                )}
              </div>
            </div>

            {(canSubmit || canApprove || canDelete) && (
              <SheetFooter className="flex-wrap">
                <div className="flex flex-wrap gap-2 w-full sm:w-auto mr-auto">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn-ghost w-full sm:w-auto justify-center"
                  >
                    <Printer size={16} /> Print
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="btn-danger w-full sm:w-auto justify-center"
                      disabled={submitting}
                    >
                      <Trash2 size={16} />
                      {submitting ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                {canSubmit && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="btn-primary w-full sm:w-auto justify-center"
                    disabled={submitting}
                  >
                    <Send size={16} />
                    {submitting ? 'Submitting...' : 'Submit for Approval'}
                  </button>
                )}
                {canApprove && (
                  <button
                    type="button"
                    onClick={() => openApprovalReview(request.id, { onSuccess: () => { load(); onUpdated?.(); } })}
                    className="btn-primary w-full sm:w-auto justify-center"
                  >
                    Review & Approve
                  </button>
                )}
              </SheetFooter>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
