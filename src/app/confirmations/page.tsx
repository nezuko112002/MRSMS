'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmationReceiptSheet } from '@/hooks/useConfirmationReceiptSheet';
import { AppShell } from '@/components/layout/AppShell';
import { RequestStatusWithItems, ItemProgressBadges } from '@/components/ui/StatusBadge';
import { EmptyState, PageLoader } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { formatDate } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem } from '@/types';
import { ClipboardCheck, CheckCircle } from 'lucide-react';

type RequestWithItems = MaterialRequest & {
  items?: Pick<MaterialRequestItem, 'status'>[];
};

function ConfirmationsPageContent() {
  const { profile } = useAuth();
  const { openConfirmationReceipt } = useConfirmationReceiptSheet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<RequestWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile) return;
    if (!opts?.silent) setLoading(true);

    const { data: releasedRows } = await supabase
      .from('material_request_items')
      .select('request_id')
      .eq('status', 'released');

    const requestIds = [
      ...new Set(
        (releasedRows ?? []).map((r: Pick<MaterialRequestItem, 'request_id'>) => r.request_id)
      ),
    ];

    if (requestIds.length === 0) {
      setPending([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('material_requests')
      .select('*, items:material_request_items(status)')
      .eq('requested_by', profile.id)
      .in('id', requestIds)
      .order('updated_at', { ascending: false });

    setPending(data || []);
    setLoading(false);
  }, [profile, supabase]);

  useEffect(() => { load(); }, [load]);

  useAutoRefresh(() => load({ silent: true }), !!profile);

  useEffect(() => {
    const confirmId = searchParams.get('confirm');
    if (confirmId) {
      openConfirmationReceipt(confirmId, { onSuccess: load });
      router.replace('/confirmations', { scroll: false });
    }
  }, [searchParams, openConfirmationReceipt, router, load]);

  const { page, setPage, paginatedItems, totalPages, totalItems, from, to } = usePagination(pending);

  if (loading) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell title="Confirmations">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">Confirmations</h2>
            <p className="page-subtitle">Confirm receipt of released materials</p>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          {pending.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No pending confirmations" description="All released materials have been confirmed." />
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Request No.</th>
                    <th>Project</th>
                    <th className="hidden sm:table-cell">Required By</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Items</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(req => (
                    <tr key={req.id}>
                      <td className="font-mono text-xs text-brand-400 font-semibold">{req.request_no}</td>
                      <td>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{req.project_name}</p>
                        <p className="text-xs text-gray-400">{req.department}</p>
                      </td>
                      <td className="hidden sm:table-cell text-sm text-gray-500">{formatDate(req.required_date)}</td>
                      <td>
                        <RequestStatusWithItems request={req} items={req.items} />
                      </td>
                      <td className="hidden md:table-cell">
                        <ItemProgressBadges items={req.items} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openConfirmationReceipt(req.id, { onSuccess: load })}
                          className="btn-success text-xs px-3 py-1.5"
                        >
                          <CheckCircle size={12} /> Confirm Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={totalItems}
                from={from}
                to={to}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function ConfirmationsPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <ConfirmationsPageContent />
    </Suspense>
  );
}
