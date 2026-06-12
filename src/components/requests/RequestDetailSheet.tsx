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
import { UnitSelect } from '@/components/ui/unit-select';
import { formatNumber, canDeleteRequest, requestNeedsApprovalReview, getRequestProjectName } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem, ApprovalHistory, RequestFormItem } from '@/types';
import { User, FileText, Printer, Send, Trash2, Plus, Save, Package, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';
import { clearWarehouseDeferredMarker } from '@/lib/warehouseDeferred';

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
  const [editItems, setEditItems] = useState<RequestFormItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setRequest(null);
    setItems([]);
    setHistory([]);
    setEditItems([]);
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
    const loadedItems = (itemsRes.data || []) as MaterialRequestItem[];
    setRequest(reqRes.data);
    setItems(loadedItems);
    setEditItems(loadedItems.map(item => ({
      id: item.id,
      description: item.description,
      unit: item.unit,
      requested_qty: item.requested_qty,
      purpose: item.purpose || '',
    })));
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

  function validateEditItems(formItems: RequestFormItem[]): boolean {
    if (formItems.length === 0) {
      toast.error('At least one item required');
      return false;
    }
    const invalid = formItems.filter(
      i => !i.description.trim() || !i.purpose.trim() || !i.requested_qty || Number(i.requested_qty) <= 0
    );
    if (invalid.length > 0) {
      toast.error('All items need a description, purpose, and valid quantity');
      return false;
    }
    return true;
  }

  function addItem() {
    setEditItems(prev => [...prev, {
      id: crypto.randomUUID(),
      description: '',
      unit: 'Bag',
      requested_qty: '',
      purpose: '',
    }]);
  }

  function removeItem(id: string) {
    if (editItems.length === 1) {
      toast.error('At least one item required');
      return;
    }
    setEditItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: keyof RequestFormItem, value: string | number) {
    setEditItems(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  }

  async function persistDraftItems(): Promise<MaterialRequestItem[]> {
    if (!request) throw new Error('Request not found');

    const originalIds = new Set(items.map(i => i.id));
    const nextIds = new Set(editItems.map(i => i.id));

    for (const item of items) {
      if (!nextIds.has(item.id)) {
        const { error } = await supabase.from('material_request_items').delete().eq('id', item.id);
        if (error) throw error;
      }
    }

    for (let i = 0; i < editItems.length; i++) {
      const row = editItems[i];
      const payload = {
        description: row.description.trim(),
        unit: row.unit,
        requested_qty: Number(row.requested_qty),
        purpose: row.purpose.trim(),
        sort_order: i,
      };

      if (originalIds.has(row.id)) {
        const { error } = await supabase.from('material_request_items').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('material_request_items').insert({
          request_id: request.id,
          item_code: null,
          ...payload,
        });
        if (error) throw error;
      }
    }

    const { data: savedItems, error: reloadErr } = await supabase
      .from('material_request_items')
      .select('*')
      .eq('request_id', request.id)
      .order('sort_order');

    if (reloadErr) throw reloadErr;
    return (savedItems || []) as MaterialRequestItem[];
  }

  async function handleSaveDraft() {
    if (!request || !profile) return;
    if (!validateEditItems(editItems)) return;

    setSubmitting(true);
    try {
      const savedItems = await persistDraftItems();
      setItems(savedItems);
      setEditItems(savedItems.map(item => ({
        id: item.id,
        description: item.description,
        unit: item.unit,
        requested_qty: item.requested_qty,
        purpose: item.purpose || '',
      })));
      await supabase.from('approval_history').insert({
        request_id: request.id,
        action_by: profile.id,
        action: 'saved_draft',
        from_status: 'draft',
        to_status: 'draft',
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(savedItems.map(i => ({ sort_order: i.sort_order, description: i.description }))),
        }),
      });
      toast.success('Draft saved!');
      onUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!request || !profile) return;
    if (!validateEditItems(editItems)) return;

    setSubmitting(true);
    try {
      const savedItems = await persistDraftItems();
      const { error } = await supabase.from('material_requests').update({ status: 'pending' }).eq('id', request.id);
      if (error) throw error;
      await supabase.from('approval_history').insert({
        request_id: request.id,
        action_by: profile.id,
        action: 'submitted',
        from_status: 'draft',
        to_status: 'pending',
        comments: buildHistoryComments({
          itemRefs: formatItemRefs(savedItems.map(i => ({ sort_order: i.sort_order, description: i.description }))),
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

  const canEdit = profile?.id === request?.requested_by && request?.status === 'draft';
  const canSubmit = canEdit;
  const canApprove =
    request?.status !== 'draft' &&
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

        {(loading || !request) && (
          <SheetTitle className="sr-only">Request details</SheetTitle>
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
                {!canEdit && <ItemProgressBadges items={items} />}
              </div>
              <SheetDescription>
                {canEdit ? 'Edit items below, then save or submit for approval.' : 'Request details and item breakdown.'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                    <FileText size={15} className="text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Project</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{getRequestProjectName(request)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                    <User size={15} className="text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Requested By</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{request.profile?.full_name}</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center">
                      <Package size={14} className="text-brand-400" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                      Requested Items
                    </h3>
                    <span className="badge bg-brand-500/15 text-brand-400 border border-brand-500/20">
                      {canEdit ? editItems.length : items.length}
                    </span>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={addItem} className="btn-secondary text-xs px-3 py-1.5 shrink-0">
                      <Plus size={14} /> Add Item
                    </button>
                  )}
                </div>

                {canEdit ? (
                  <div className="space-y-2">
                    {editItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 p-3 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10"
                      >
                        <div className="col-span-12 flex items-center justify-between md:hidden mb-1">
                          <span className="text-xs font-semibold text-gray-400">Item {index + 1}</span>
                          <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 p-1">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="col-span-12 md:col-span-5">
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateItem(item.id, 'description', e.target.value)}
                            className="glass-input text-xs"
                            placeholder="Description *"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <UnitSelect
                            value={item.unit}
                            onChange={unit => updateItem(item.id, 'unit', unit)}
                            triggerClassName="h-9 text-xs"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <input
                            type="number"
                            value={item.requested_qty}
                            onChange={e => updateItem(item.id, 'requested_qty', e.target.value)}
                            className="glass-input text-xs"
                            placeholder="Qty *"
                            min="0.01"
                            step="0.01"
                          />
                        </div>
                        <div className="col-span-12 md:col-span-2">
                          <input
                            type="text"
                            value={item.purpose}
                            onChange={e => updateItem(item.id, 'purpose', e.target.value)}
                            className="glass-input text-xs"
                            placeholder="Purpose *"
                            required
                          />
                        </div>
                        <div className="hidden md:flex col-span-1 items-center justify-center">
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-400/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addItem}
                      className="w-full btn-ghost text-sm border border-dashed border-white/20 dark:border-white/10 rounded-xl py-2.5"
                    >
                      <Plus size={16} /> Add another item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, i) => {
                      const displayPurpose = clearWarehouseDeferredMarker(item.purpose);
                      return (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <span className="text-xs text-gray-400 font-mono mr-1">#{i + 1}</span>
                            <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{item.description}</span>
                            {displayPurpose && (
                              <p className="text-xs text-gray-400 italic mt-0.5">{displayPurpose}</p>
                            )}
                            {item.reject_reason && (
                              <p className="text-xs text-red-400 mt-0.5">Rejected: {item.reject_reason}</p>
                            )}
                          </div>
                          <ItemStatusBadge item={item} />
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
                    );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Clock size={14} className="text-amber-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Activity Timeline</h3>
                </div>
                {history.length === 0 ? (
                  <p className="text-sm text-gray-400 p-4 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10">
                    No activity yet.
                  </p>
                ) : (
                  <ApprovalTimeline history={history} items={items} />
                )}
              </div>
            </div>

            {(canSubmit || canApprove || canDelete) && (
              <SheetFooter className="!flex-row flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn-ghost px-4 py-2.5"
                  >
                    <Printer size={16} /> Print
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="btn-danger px-4 py-2.5"
                      disabled={submitting}
                    >
                      <Trash2 size={16} />
                      {submitting ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                  {canSubmit && (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        className="btn-secondary px-4 py-2.5"
                        disabled={submitting}
                      >
                        <Save size={16} />
                        {submitting ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        className="btn-primary px-4 py-2.5"
                        disabled={submitting}
                      >
                        <Send size={16} />
                        {submitting ? 'Submitting...' : 'Submit'}
                      </button>
                    </>
                  )}
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => openApprovalReview(request.id, { onSuccess: () => { load(); onUpdated?.(); } })}
                      className="btn-primary px-4 py-2.5"
                    >
                      Review & Approve
                    </button>
                  )}
                </div>
              </SheetFooter>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
