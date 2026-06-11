'use client';

import { useCallback, useEffect, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogCloseButton,
} from '@/components/ui/dialog';
import { ProjectSelect } from '@/components/ui/project-select';
import { UnitSelect } from '@/components/ui/unit-select';
import toast from 'react-hot-toast';
import { formatItemRefs, buildHistoryComments } from '@/lib/historyComments';
import type { RequestFormItem } from '@/types';
import { Plus, Trash2, Save, Send, Package } from 'lucide-react';

function createEmptyItem(id: string): RequestFormItem {
  return { id, description: '', unit: 'Bag', requested_qty: '', remarks: '' };
}

interface NewRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (requestId: string) => void;
}

export function NewRequestModal({ open, onOpenChange, onSuccess }: NewRequestModalProps) {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const firstItemId = useId();
  const [loading, setLoading] = useState(false);

  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<RequestFormItem[]>(() => [createEmptyItem(firstItemId)]);

  const resetForm = useCallback(() => {
    setProjectId('');
    setItems([createEmptyItem(firstItemId)]);
    setLoading(false);
  }, [firstItemId]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  function addItem() {
    setItems(prev => [...prev, createEmptyItem(crypto.randomUUID())]);
  }

  function removeItem(id: string) {
    if (items.length === 1) {
      toast.error('At least one item required');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: keyof RequestFormItem, value: string | number) {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  }

  async function handleSubmit(status: 'draft' | 'pending') {
    if (!profile) return;
    if (!projectId) {
      toast.error('Please select a project');
      return;
    }
    const invalidItems = items.filter(
      i => !i.description.trim() || !i.requested_qty || Number(i.requested_qty) <= 0
    );
    if (invalidItems.length > 0) {
      toast.error('All items need a description and valid quantity');
      return;
    }

    setLoading(true);
    try {
      const { data: project, error: projectErr } = await supabase
        .from('projects')
        .select('name, department')
        .eq('id', projectId)
        .eq('is_active', true)
        .single();

      if (projectErr || !project) throw new Error('Selected project is not available');

      const { data: req, error } = await supabase.from('material_requests').insert({
        project_id: projectId,
        project_name: project.name,
        department: project.department,
        requested_by: profile.id,
        purpose: null,
        required_date: null,
        notes: null,
        status,
      }).select().single();

      if (error) throw error;

      const itemRows = items.map((item, i) => ({
        request_id: req.id,
        item_code: null,
        description: item.description.trim(),
        unit: item.unit,
        requested_qty: Number(item.requested_qty),
        remarks: item.remarks.trim() || null,
        sort_order: i,
      }));

      const { error: itemErr } = await supabase.from('material_request_items').insert(itemRows);
      if (itemErr) throw itemErr;

      const itemRefs = formatItemRefs(
        items.map((item, i) => ({ sort_order: i, description: item.description.trim() }))
      );
      await supabase.from('approval_history').insert({
        request_id: req.id,
        action_by: profile.id,
        action: status === 'draft' ? 'saved_draft' : 'submitted',
        to_status: status,
        comments: status === 'pending' ? buildHistoryComments({ itemRefs }) : null,
      });

      toast.success(status === 'draft' ? 'Draft saved!' : 'Request submitted for approval!');
      onOpenChange(false);

      if (onSuccess) {
        onSuccess(req.id);
      } else {
        router.push(`/requests/${req.id}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>New Material Request</DialogTitle>
          <DialogDescription>Select a project and add the items you need.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-sm">
              <Package size={16} className="text-brand-500" />
              Project
            </h3>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Project <span className="text-red-400">*</span>
              </label>
              <ProjectSelect value={projectId} onChange={setProjectId} placeholder="Select project..." />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                <Package size={16} className="text-brand-500" />
                Request Items
                <span className="badge bg-brand-500/15 text-brand-400 border border-brand-500/20 text-xs">
                  {items.length}
                </span>
              </h3>
              <button type="button" onClick={addItem} className="btn-secondary text-xs px-3 py-1.5">
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, index) => (
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
                      value={item.remarks}
                      onChange={e => updateItem(item.id, 'remarks', e.target.value)}
                      className="glass-input text-xs"
                      placeholder="Note"
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
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-2 w-full btn-ghost text-sm border border-dashed border-white/20 dark:border-white/10 rounded-xl py-2.5"
            >
              <Plus size={16} /> Add another item
            </button>
          </section>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="btn-secondary w-full sm:w-auto justify-center">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            className="btn-secondary w-full sm:w-auto justify-center"
            disabled={loading}
          >
            <Save size={16} /> Save Draft
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('pending')}
            className="btn-primary w-full sm:w-auto justify-center"
            disabled={loading}
          >
            <Send size={16} /> {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
