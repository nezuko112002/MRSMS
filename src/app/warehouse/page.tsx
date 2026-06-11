'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRequestDetailSheet } from '@/hooks/useRequestDetailSheet';
import { useWarehouseReleaseSheet } from '@/hooks/useWarehouseReleaseSheet';
import { AppShell } from '@/components/layout/AppShell';
import { RequestStatusWithItems, ItemProgressBadges } from '@/components/ui/StatusBadge';
import { EmptyState, PageLoader } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem } from '@/types';

type RequestWithItems = MaterialRequest & {
  profile?: { full_name: string };
  items?: Pick<MaterialRequestItem, 'status'>[];
};
import { Warehouse, ArrowRight, Package } from 'lucide-react';

function WarehousePageContent() {
  const { openRequestDetail } = useRequestDetailSheet();
  const { openWarehouseRelease } = useWarehouseReleaseSheet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<MaterialRequest[]>([]);
  const [released, setReleased] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);

    const { data: approvedItemRows } = await supabase
      .from('material_request_items')
      .select('request_id')
      .eq('status', 'approved');

    const readyIds = [
      ...new Set(
        (approvedItemRows ?? []).map((r: Pick<MaterialRequestItem, 'request_id'>) => r.request_id)
      ),
    ];

    const [readyRes, relRes] = await Promise.all([
      readyIds.length > 0
        ? supabase.from('material_requests')
            .select('*, profile:profiles(full_name), items:material_request_items(status)')
            .in('id', readyIds)
            .order('updated_at')
        : Promise.resolve({ data: [] as RequestWithItems[] }),
      supabase.from('material_requests')
        .select('*, profile:profiles(full_name), items:material_request_items(status)')
        .in('status', ['released', 'partially_released', 'confirmed', 'completed'])
        .order('updated_at', { ascending: false }),
    ]);

    setPending(readyRes.data || []);
    setReleased(relRes.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const processId = searchParams.get('process');
    if (processId) {
      openWarehouseRelease(processId, { onSuccess: load });
      router.replace('/warehouse', { scroll: false });
    }
  }, [searchParams, openWarehouseRelease, router, load]);

  const pendingPagination = usePagination(pending);
  const releasedPagination = usePagination(released);

  if (loading) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell title="Warehouse">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">Warehouse</h2>
            <p className="page-subtitle">Process approved material requests for release</p>
          </div>
        </div>

        {/* Ready to release */}
        <div className="glass-card overflow-hidden mb-6">
          <div className="p-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Warehouse size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Ready to Release</h3>
              <p className="text-xs text-gray-400">Approved requests awaiting material release</p>
            </div>
            {pending.length > 0 && (
              <span className="ml-auto badge bg-violet-500/15 text-violet-400 border border-violet-500/20">{pending.length}</span>
            )}
          </div>
          {pending.length === 0 ? (
            <EmptyState icon={Package} title="Nothing to release" description="All approved requests have been processed." />
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Request No.</th>
                    <th>Project</th>
                    <th className="hidden sm:table-cell">Requested By</th>
                    <th className="hidden md:table-cell">Required By</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Items</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPagination.paginatedItems.map(req => (
                    <tr key={req.id}>
                      <td className="font-mono text-xs text-brand-400 font-semibold">{req.request_no}</td>
                      <td>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{req.project_name}</p>
                        <p className="text-xs text-gray-400">{req.department}</p>
                      </td>
                      <td className="hidden sm:table-cell text-sm text-gray-500">
                        {(req as MaterialRequest & { profile?: { full_name: string } }).profile?.full_name}
                      </td>
                      <td className="hidden md:table-cell text-sm text-gray-500">{formatDate(req.required_date)}</td>
                      <td>
                        <RequestStatusWithItems
                          request={req}
                          items={(req as RequestWithItems).items}
                        />
                      </td>
                      <td className="hidden md:table-cell">
                        <ItemProgressBadges items={(req as RequestWithItems).items} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openWarehouseRelease(req.id, { onSuccess: load })}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          Process <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={pendingPagination.page}
                totalPages={pendingPagination.totalPages}
                totalItems={pendingPagination.totalItems}
                from={pendingPagination.from}
                to={pendingPagination.to}
                onPageChange={pendingPagination.setPage}
              />
            </div>
          )}
        </div>

        {/* Recently released */}
        {released.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-semibold text-gray-900 dark:text-white">Recently Processed</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Request No.</th>
                    <th>Project</th>
                    <th className="hidden sm:table-cell">Requested By</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Items</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {releasedPagination.paginatedItems.map(req => (
                    <tr key={req.id}>
                      <td className="font-mono text-xs text-brand-400 font-semibold">{req.request_no}</td>
                      <td>
                        <p className="font-medium text-gray-700 dark:text-gray-300">{req.project_name}</p>
                        <p className="text-xs text-gray-400">{req.department}</p>
                      </td>
                      <td className="hidden sm:table-cell text-sm text-gray-500">
                        {(req as MaterialRequest & { profile?: { full_name: string } }).profile?.full_name}
                      </td>
                      <td>
                        <RequestStatusWithItems
                          request={req}
                          items={(req as RequestWithItems).items}
                        />
                      </td>
                      <td className="hidden md:table-cell">
                        <ItemProgressBadges items={(req as RequestWithItems).items} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openRequestDetail(req.id, { onUpdated: load })}
                          className="btn-ghost p-1.5 rounded-lg"
                          aria-label="View request"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={releasedPagination.page}
                totalPages={releasedPagination.totalPages}
                totalItems={releasedPagination.totalItems}
                from={releasedPagination.from}
                to={releasedPagination.to}
                onPageChange={releasedPagination.setPage}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function WarehousePage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <WarehousePageContent />
    </Suspense>
  );
}
