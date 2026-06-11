'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNewRequestModal } from '@/hooks/useNewRequestModal';
import { useRequestDetailSheet } from '@/hooks/useRequestDetailSheet';
import { AppShell } from '@/components/layout/AppShell';
import { RequestStatusWithItems, ItemProgressBadges } from '@/components/ui/StatusBadge';
import { EmptyState, PageLoader } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDate, canCreateRequest, getDisplayRequestStatus } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem, RequestStatus } from '@/types';

type RequestWithItems = MaterialRequest & { items?: Pick<MaterialRequestItem, 'status'>[] };
import { Plus, Search, Filter, FileText, ArrowRight } from 'lucide-react';

const STATUS_FILTERS: { label: string; value: RequestStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Released', value: 'released' },
  { label: 'Completed', value: 'completed' },
];

function RequestsPageContent() {
  const { profile } = useAuth();
  const { openNewRequest } = useNewRequestModal();
  const { openRequestDetail } = useRequestDetailSheet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [filtered, setFiltered] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let q = supabase
      .from('material_requests')
      .select('*, profile:profiles(full_name, role), items:material_request_items(status)')
      .order('created_at', { ascending: false });

    if (profile.role === 'requestor') q = q.eq('requested_by', profile.id);

    const { data } = await q;
    setRequests(data || []);
    setLoading(false);
  }, [profile, supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNewRequest({ onSuccess: load });
      router.replace('/requests', { scroll: false });
    }
  }, [searchParams, openNewRequest, router, load]);

  useEffect(() => {
    const viewId = searchParams.get('view');
    if (viewId) {
      openRequestDetail(viewId, { onUpdated: load });
      router.replace('/requests', { scroll: false });
    }
  }, [searchParams, openRequestDetail, router, load]);

  useEffect(() => {
    let result = requests;
    if (statusFilter !== 'all') {
      result = result.filter(r => {
        const items = (r as RequestWithItems).items;
        return getDisplayRequestStatus(r, items) === statusFilter;
      });
    }
    if (search) result = result.filter(r =>
      r.request_no.toLowerCase().includes(search.toLowerCase()) ||
      r.project_name.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(result);
  }, [requests, search, statusFilter]);

  const {
    page,
    setPage,
    paginatedItems: paginatedRequests,
    totalPages,
    totalItems,
    from,
    to,
  } = usePagination(filtered, [search, statusFilter]);

  if (loading) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell title="Requests">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">Material Requests</h2>
            <p className="page-subtitle">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          {canCreateRequest(profile?.role) && (
            <button type="button" onClick={() => openNewRequest({ onSuccess: load })} className="btn-primary">
              <Plus size={16} /> New Request
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search requests or projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="glass-input pl-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-gray-400 hidden sm:block" />
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  statusFilter === f.value
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
                    : 'glass text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="glass-card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No requests found"
              description={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first material request.'}
              action={canCreateRequest(profile?.role) ? (
                <button type="button" onClick={() => openNewRequest({ onSuccess: load })} className="btn-primary text-sm">
                  <Plus size={14} /> New Request
                </button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Request No.</th>
                    <th>Project</th>
                    <th className="hidden md:table-cell">Requested By</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Items</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedRequests.map(req => (
                    <tr
                      key={req.id}
                      onClick={() => openRequestDetail(req.id, { onUpdated: load })}
                      className="cursor-pointer hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                    >
                      <td>
                        <span className="font-mono text-xs text-brand-500 dark:text-brand-400 font-semibold">
                          {req.request_no}
                        </span>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(req.created_at)}</p>
                      </td>
                      <td>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{req.project_name}</p>
                      </td>
                      <td className="hidden md:table-cell text-sm text-gray-600 dark:text-gray-300">
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
                          onClick={e => {
                            e.stopPropagation();
                            openRequestDetail(req.id, { onUpdated: load });
                          }}
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

export default function RequestsPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <RequestsPageContent />
    </Suspense>
  );
}
