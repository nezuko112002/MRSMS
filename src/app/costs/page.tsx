'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/ui/TablePagination';
import { usePagination } from '@/hooks/usePagination';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import type { CostRecord } from '@/types';
import { DollarSign, TrendingUp, FileText } from 'lucide-react';

interface ProjectCost {
  project_name: string;
  total: number;
  items: number;
}

export default function CostsPage() {
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [projectSummary, setProjectSummary] = useState<ProjectCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cost_records')
      .select('*')
      .order('recorded_at', { ascending: false });

    const recs = (data ?? []) as CostRecord[];
    setRecords(recs);

    // Build project summary
    const byProject: Record<string, ProjectCost> = {};
    recs.forEach(r => {
      if (!byProject[r.project_name]) byProject[r.project_name] = { project_name: r.project_name, total: 0, items: 0 };
      byProject[r.project_name].total += r.total_cost;
      byProject[r.project_name].items += 1;
    });
    setProjectSummary(Object.values(byProject).sort((a, b) => b.total - a.total));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filteredRecords = selectedProject === 'all'
    ? records
    : records.filter(r => r.project_name === selectedProject);

  const totalSpend = filteredRecords.reduce((s, r) => s + r.total_cost, 0);

  const { page, setPage, paginatedItems, totalPages, totalItems, from, to } = usePagination(
    filteredRecords,
    [selectedProject]
  );

  if (loading) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell title="Cost Records">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">Cost Records</h2>
            <p className="page-subtitle">Project material cost tracking</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <DollarSign size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalSpend)}</p>
              <p className="text-sm text-gray-500">Total Material Spend</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center">
              <TrendingUp size={20} className="text-brand-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{projectSummary.length}</p>
              <p className="text-sm text-gray-500">Projects</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <FileText size={20} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredRecords.length}</p>
              <p className="text-sm text-gray-500">Cost Entries</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Project breakdown */}
          <div className="glass-card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">By Project</h3>
            <div className="space-y-2">
              <button
                onClick={() => setSelectedProject('all')}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  selectedProject === 'all'
                    ? 'bg-brand-500/15 text-brand-400 font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex justify-between">
                  <span>All Projects</span>
                  <span className="font-semibold">{formatCurrency(records.reduce((s, r) => s + r.total_cost, 0))}</span>
                </div>
              </button>
              {projectSummary.map(p => (
                <button
                  key={p.project_name}
                  onClick={() => setSelectedProject(p.project_name)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    selectedProject === p.project_name
                      ? 'bg-brand-500/15 text-brand-400 font-medium'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{p.project_name}</span>
                    <span className="font-semibold flex-shrink-0">{formatCurrency(p.total)}</span>
                  </div>
                  <p className="text-xs text-gray-400">{p.items} items</p>
                </button>
              ))}
            </div>
          </div>

          {/* Detail table */}
          <div className="lg:col-span-2 glass-card overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {selectedProject === 'all' ? 'All Records' : selectedProject}
              </h3>
              <span className="font-bold text-emerald-400">{formatCurrency(totalSpend)}</span>
            </div>
            {filteredRecords.length === 0 ? (
              <EmptyState icon={DollarSign} title="No cost records" description="Costs are recorded when requestors confirm receipt." />
            ) : (
              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right hidden sm:table-cell">Unit Cost</th>
                      <th className="text-right">Amount</th>
                      <th className="hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map(rec => (
                      <tr key={rec.id}>
                        <td>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{rec.description}</p>
                          <p className="text-xs text-gray-400">{rec.project_name}</p>
                        </td>
                        <td className="text-right text-sm">{formatNumber(rec.qty)}</td>
                        <td className="text-right text-sm text-gray-500 hidden sm:table-cell">{formatCurrency(rec.unit_cost)}</td>
                        <td className="text-right font-semibold text-emerald-400">{formatCurrency(rec.total_cost)}</td>
                        <td className="hidden md:table-cell text-xs text-gray-400">{formatDate(rec.recorded_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-white/20">
                      <td colSpan={2} className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Total</td>
                      <td className="hidden sm:table-cell" />
                      <td className="px-4 py-3 text-right font-bold text-emerald-400 text-base">{formatCurrency(totalSpend)}</td>
                      <td className="hidden md:table-cell" />
                    </tr>
                  </tfoot>
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
      </div>
    </AppShell>
  );
}
