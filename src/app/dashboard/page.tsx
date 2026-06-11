'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNewRequestModal } from '@/hooks/useNewRequestModal';
import { useRequestDetailSheet } from '@/hooks/useRequestDetailSheet';
import { AppShell } from '@/components/layout/AppShell';
import { StatsCard } from '@/components/ui/StatsCard';
import { RequestStatusWithItems, ItemProgressBadges } from '@/components/ui/StatusBadge';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDate, formatCurrency, canCreateRequest } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem } from '@/types';

type RequestWithItems = MaterialRequest & { items?: Pick<MaterialRequestItem, 'status'>[] };
import {
  FileText, Clock, CheckSquare, Package,
  DollarSign, Plus, ArrowRight, TrendingUp
} from 'lucide-react';

export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const { openNewRequest } = useNewRequestModal();
  const { openRequestDetail } = useRequestDetailSheet();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [stats, setStats] = useState({
    total: 0, pending: 0, monthlySpend: 0
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadDashboard = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Recent requests
      let reqQuery = supabase
        .from('material_requests')
        .select('*, profile:profiles(full_name, email, role, department), items:material_request_items(status)')
        .order('created_at', { ascending: false });

      if (profile?.role === 'requestor') {
        reqQuery = reqQuery.eq('requested_by', profile.id);
      }

      const { data: reqs } = await reqQuery;
      setRequests(reqs || []);

      // Stats
      let totalQuery = supabase.from('material_requests').select('id', { count: 'exact', head: true });
      if (profile.role === 'requestor') {
        totalQuery = totalQuery.eq('requested_by', profile.id);
      }

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [totalRes, pendingRes, costRes] = await Promise.all([
        totalQuery,
        supabase.from('material_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('cost_records').select('total_cost').gte('recorded_at', monthStart),
      ]);

      const monthSpend = (costRes.data || []).reduce((s: number, r: { total_cost: number }) => s + (r.total_cost || 0), 0);

      setStats({
        total:       totalRes.count || 0,
        pending:     pendingRes.count || 0,
        monthlySpend: monthSpend,
      });
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const { page, setPage, paginatedItems, totalPages, totalItems, from, to } = usePagination(requests);

  if (authLoading || loading) return <AppShell><PageLoader /></AppShell>;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <AppShell title="Dashboard">
      <div className="page-container">
        {/* Greeting */}
        <div className="page-header">
          <div>
            <h2 className="page-title">{greeting()}, {profile?.full_name.split(' ')[0]} 👋</h2>
            <p className="page-subtitle">Here&apos;s what&apos;s happening with your material requests.</p>
          </div>
          {canCreateRequest(profile?.role) && (
            <button type="button" onClick={() => openNewRequest({ onSuccess: loadDashboard })} className="btn-primary">
              <Plus size={16} />
              New Request
            </button>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            label={profile?.role === 'requestor' ? 'My Requests' : 'Total Requests'}
            value={stats.total}
            icon={FileText}
            iconColor="text-brand-500"
          />
          <StatsCard
            label="Pending Approval"
            value={stats.pending}
            icon={Clock}
            iconColor="text-amber-500"
            subtext="Awaiting manager review"
          />
          {(profile?.role === 'finance' || profile?.role === 'manager' || profile?.role === 'admin') && (
            <StatsCard
              label="This Month's Spend"
              value={formatCurrency(stats.monthlySpend)}
              icon={DollarSign}
              iconColor="text-emerald-500"
              subtext="Material cost recorded"
            />
          )}
          <StatsCard
            label="Active Projects"
            value={[...new Set(requests.map(r => r.project_name))].length}
            icon={TrendingUp}
            iconColor="text-cyan-500"
          />
        </div>

        {/* Recent Requests */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-white/10">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Requests</h3>
              <p className="text-xs text-gray-400 mt-0.5">Latest material requests across the system</p>
            </div>
            <Link href="/requests" className="btn-ghost text-xs">
              View all <ArrowRight size={14} />
            </Link>
          </div>

          {requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Package size={32} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500">No requests yet</p>
              {canCreateRequest(profile?.role) && (
                <button type="button" onClick={() => openNewRequest({ onSuccess: loadDashboard })} className="btn-primary text-xs px-4 py-2">
                  Create your first request
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Request No.</th>
                    <th>Project</th>
                    <th className="hidden md:table-cell">Requested By</th>
                    <th className="hidden sm:table-cell">Date</th>
                    <th>Status</th>
                    <th className="hidden lg:table-cell">Items</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(req => (
                    <tr key={req.id}>
                      <td>
                        <span className="font-mono text-xs text-brand-500 dark:text-brand-400 font-medium">
                          {req.request_no}
                        </span>
                      </td>
                      <td>
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[160px]">
                          {req.project_name}
                        </p>
                        <p className="text-xs text-gray-400">{req.department}</p>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="text-gray-600 dark:text-gray-300 text-xs">
                          {(req as MaterialRequest & { profile?: { full_name: string } }).profile?.full_name}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell text-gray-500 text-xs">
                        {formatDate(req.created_at)}
                      </td>
                      <td>
                        <RequestStatusWithItems
                          request={req}
                          items={(req as RequestWithItems).items}
                        />
                      </td>
                      <td className="hidden lg:table-cell">
                        <ItemProgressBadges items={(req as RequestWithItems).items} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openRequestDetail(req.id)}
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

        {/* Quick actions */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {canCreateRequest(profile?.role) && (
            <button
              type="button"
              onClick={() => openNewRequest({ onSuccess: loadDashboard })}
              className="glass-card p-5 flex items-center gap-4 hover:scale-[1.01] transition-transform group text-left w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center group-hover:bg-brand-600/30 transition-colors">
                <Plus size={20} className="text-brand-500" />
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-white">New Request</p>
                <p className="text-xs text-gray-400">Submit material request</p>
              </div>
            </button>
          )}
          {(profile?.role === 'manager' || profile?.role === 'admin') && (
            <Link href="/approvals" className="glass-card p-5 flex items-center gap-4 hover:scale-[1.01] transition-transform group">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                <CheckSquare size={20} className="text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-white">Pending Approvals</p>
                <p className="text-xs text-gray-400">{stats.pending} requests waiting</p>
              </div>
            </Link>
          )}
          {(profile?.role === 'warehouse' || profile?.role === 'admin') && (
            <Link href="/warehouse" className="glass-card p-5 flex items-center gap-4 hover:scale-[1.01] transition-transform group">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                <Package size={20} className="text-violet-500" />
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-white">Release Materials</p>
                <p className="text-xs text-gray-400">Process approved requests</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
