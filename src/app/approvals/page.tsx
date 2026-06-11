'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useApprovalReviewSheet } from '@/hooks/useApprovalReviewSheet';
import { useRequestDetailSheet } from '@/hooks/useRequestDetailSheet';
import { AppShell } from '@/components/layout/AppShell';
import { RequestStatusWithItems, ItemProgressBadges } from '@/components/ui/StatusBadge';
import { EmptyState, PageLoader } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem } from '@/types';

type RequestWithItems = MaterialRequest & {
  profile?: { full_name: string; department?: string | null };
  items?: Pick<MaterialRequestItem, 'status'>[];
};
import { CheckSquare, ArrowRight, Clock } from 'lucide-react';

function ApprovalsPageContent() {
  const { profile } = useAuth();
  const { openApprovalReview } = useApprovalReviewSheet();
  const { openRequestDetail } = useRequestDetailSheet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<MaterialRequest[]>([]);
  const [reviewed, setReviewed] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);

    const { data: pendingItemRows } = await supabase
      .from('material_request_items')
      .select('request_id')
      .eq('status', 'pending');

    const pendingRequestIds = [
      ...new Set(
        (pendingItemRows ?? []).map((r: Pick<MaterialRequestItem, 'request_id'>) => r.request_id)
      ),
    ];

    const [pendingRes, reviewedRes] = await Promise.all([
      pendingRequestIds.length > 0
        ? supabase.from('material_requests')
            .select('*, profile:profiles(full_name, department), items:material_request_items(status)')
            .in('id', pendingRequestIds)
            .neq('status', 'draft')
            .order('created_at')
        : Promise.resolve({ data: [] as RequestWithItems[] }),
      supabase.from('material_requests')
        .select('*, profile:profiles(full_name, department), items:material_request_items(status)')
        .in('status', ['approved', 'partially_approved', 'rejected', 'released', 'partially_released', 'confirmed', 'completed'])
        .order('updated_at', { ascending: false }),
    ]);

    const reviewed = ((reviewedRes.data ?? []) as RequestWithItems[]).filter(
      req => !req.items?.some(i => i.status === 'pending')
    );

    setPending(pendingRes.data || []);
    setReviewed(reviewed);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  useEffect(() => {
    const reviewId = searchParams.get('review');
    if (reviewId) {
      openApprovalReview(reviewId, { onSuccess: load });
      router.replace('/approvals', { scroll: false });
    }
  }, [searchParams, openApprovalReview, router, load]);

  const pendingPagination = usePagination(pending);
  const reviewedPagination = usePagination(reviewed);

  if (loading) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell title="Approvals">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">Approval Queue</h2>
            <p className="page-subtitle">{pending.length} request{pending.length !== 1 ? 's' : ''} pending review</p>
          </div>
        </div>

        {/* Pending */}
        <div className="glass-card overflow-hidden mb-6">
          <div className="p-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Clock size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Pending Review</h3>
              <p className="text-xs text-gray-400">Requests waiting for your approval</p>
            </div>
            {pending.length > 0 && (
              <span className="ml-auto badge bg-amber-500/15 text-amber-400 border border-amber-500/20">
                {pending.length}
              </span>
            )}
          </div>
          {pending.length === 0 ? (
            <EmptyState icon={CheckSquare} title="All caught up!" description="No requests pending review." />
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Request No.</th>
                    <th>Project</th>
                    <th className="hidden sm:table-cell">Requested By</th>
                    <th className="hidden md:table-cell">Required Date</th>
                    <th className="hidden lg:table-cell">Submitted</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Items</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPagination.paginatedItems.map(req => (
                    <tr key={req.id}>
                      <td>
                        <span className="font-mono text-xs text-brand-400 font-semibold">{req.request_no}</span>
                      </td>
                      <td>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{req.project_name}</p>
                        <p className="text-xs text-gray-400">{req.department}</p>
                      </td>
                      <td className="hidden sm:table-cell text-sm text-gray-500">
                        {(req as MaterialRequest & { profile?: { full_name: string } }).profile?.full_name}
                      </td>
                      <td className="hidden md:table-cell text-sm text-gray-500">{formatDate(req.required_date)}</td>
                      <td className="hidden lg:table-cell text-sm text-gray-500">{formatDate(req.created_at)}</td>
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
                          onClick={() => openApprovalReview(req.id, { onSuccess: load })}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          Review <ArrowRight size={12} />
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

        {/* Recently reviewed */}
        {reviewed.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-semibold text-gray-900 dark:text-white">Recently Reviewed</h3>
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
                  {reviewedPagination.paginatedItems.map(req => (
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
                page={reviewedPagination.page}
                totalPages={reviewedPagination.totalPages}
                totalItems={reviewedPagination.totalItems}
                from={reviewedPagination.from}
                to={reviewedPagination.to}
                onPageChange={reviewedPagination.setPage}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <ApprovalsPageContent />
    </Suspense>
  );
}
