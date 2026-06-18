'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { formatNumber, getDisplayItemStatus, getDisplayRequestStatus, ITEM_STATUS_CONFIG, REQUEST_STATUS_CONFIG } from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem, Project, RequestStatus, ItemStatus } from '@/types';
import toast from 'react-hot-toast';
import { Printer, FileText } from 'lucide-react';
import { isWarehouseDeferred } from '@/lib/warehouseDeferred';
import {
  filterProjectSummaryByDateRange,
  type ProjectSummaryMaterialLine,
  type ProjectSummaryPrintData,
} from '@/lib/projectSummaryPrint';
import { ProjectSummaryPrintDialog } from '@/components/project-summary/ProjectSummaryPrintDialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ItemStatusFields = Pick<
  MaterialRequestItem,
  'status' | 'release_deferred' | 'purpose' | 'approved_qty' | 'released_qty' | 'requested_qty' | 'received_qty'
>;

type RequestWithItems = MaterialRequest & {
  items: MaterialRequestItem[];
};

type RequestStatusCount = Record<RequestStatus, number>;
type ItemStatusCount = Record<ItemStatus, number>;

type ProjectSummary = {
  project_name: string;
  department: string | null;
  requestCount: number;
  requestStatusCounts: Partial<RequestStatusCount>;
  itemStatusCounts: Partial<ItemStatusCount>;
  qtyRequested: number;
  qtyApproved: number;
  qtyReleased: number;
  qtyReceived: number;
  deferredItems: number;
  totalCost: number | null;
  lastActivityAt: string | null;
  materialLines: ProjectSummaryMaterialLine[];
};

function asNumber(v: number | null | undefined) {
  const n = typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

function normalizeItemFields(item: MaterialRequestItem): ItemStatusFields {
  return {
    status: item.status,
    release_deferred: item.release_deferred ?? false,
    purpose: item.purpose ?? null,
    approved_qty: item.approved_qty,
    released_qty: item.released_qty,
    requested_qty: item.requested_qty,
    received_qty: item.received_qty,
  };
}

const REQUEST_STATUS_ORDER: RequestStatus[] = [
  'draft',
  'pending',
  'approved',
  'partially_approved',
  'rejected',
  'released',
  'partially_released',
  'confirmed',
  'completed',
];

const ITEM_STATUS_ORDER: ItemStatus[] = [
  'pending',
  'approved',
  'rejected',
  'released',
  'received',
];

function isActiveProjectRequest(
  request: Pick<MaterialRequest, 'project_id' | 'project_name'>,
  activeProjectIds: Set<string>,
  activeProjectNames: Set<string>,
) {
  if (request.project_id) return activeProjectIds.has(request.project_id);
  return activeProjectNames.has(request.project_name);
}

export default function ProjectSummaryPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<'all' | string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [printSummary, setPrintSummary] = useState<ProjectSummaryPrintData | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  const canViewCosts = profile?.role === 'finance' || profile?.role === 'admin' || profile?.role === 'manager';

  const handlePrint = (summary: ProjectSummary) => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error('From date must be on or before To date');
      return;
    }

    const printable = filterProjectSummaryByDateRange(summary, dateFrom, dateTo);

    if ((dateFrom || dateTo) && printable.materialLines.length === 0) {
      toast.error('No materials found in the selected date range');
      return;
    }

    setPrintSummary(printable);
    setPrintDialogOpen(true);
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile) return;
    if (!opts?.silent) setLoading(true);

    try {
      const [{ data: reqData, error: reqErr }, { data: activeProjects, error: projectsErr }] = await Promise.all([
        supabase
          .from('material_requests')
          .select(`
          id,
          request_no,
          project_id,
          project_name,
          department,
          requested_by,
          status,
          created_at,
          updated_at,
          items:material_request_items(
            id,
            description,
            unit,
            status,
            release_deferred,
            purpose,
            approved_qty,
            released_qty,
            received_qty,
            requested_qty,
            sort_order
          )
        `),
        supabase
          .from('projects')
          .select('id, name')
          .eq('is_active', true),
      ]);

      if (reqErr) throw reqErr;
      if (projectsErr) throw projectsErr;

      const projects = (activeProjects ?? []) as Array<Pick<Project, 'id' | 'name'>>;
      const activeProjectIds = new Set(projects.map(p => p.id));
      const activeProjectNames = new Set(projects.map(p => p.name));

      const activeReqs = ((reqData ?? []) as RequestWithItems[]).filter(r =>
        isActiveProjectRequest(r, activeProjectIds, activeProjectNames),
      );

      // Extra client-side filtering (RLS should already do this, but keep UI consistent).
      const filteredReqs = profile.role === 'requestor'
        ? activeReqs.filter(r => r.requested_by === profile.id)
        : activeReqs;

      // Group requests by project.
      const byProject = new Map<string, ProjectSummary>();

      for (const r of filteredReqs) {
        const key = r.project_name || '(Unassigned)';
        if (!byProject.has(key)) {
          byProject.set(key, {
            project_name: key,
            department: r.department ?? null,
            requestCount: 0,
            requestStatusCounts: {},
            itemStatusCounts: {},
            qtyRequested: 0,
            qtyApproved: 0,
            qtyReleased: 0,
            qtyReceived: 0,
            deferredItems: 0,
            totalCost: null,
            lastActivityAt: r.updated_at ?? null,
            materialLines: [],
          });
        }

        const agg = byProject.get(key)!;
        agg.requestCount += 1;
        if (r.updated_at) {
          if (!agg.lastActivityAt) agg.lastActivityAt = r.updated_at;
          else if (new Date(r.updated_at).getTime() > new Date(agg.lastActivityAt).getTime()) {
            agg.lastActivityAt = r.updated_at;
          }
        }

        const items = (r.items ?? []) as MaterialRequestItem[];
        const itemFields = items.map(normalizeItemFields);
        const displayReqStatus = getDisplayRequestStatus({ status: r.status }, itemFields);

        agg.requestStatusCounts[displayReqStatus] = (agg.requestStatusCounts[displayReqStatus] ?? 0) + 1;

        for (let i = 0; i < items.length; i++) {
          const rawItem = items[i];
          const item = itemFields[i];
          // Warehouse deferred items are intentionally shown as pending in the UI,
          // so summary uses the same display mapping.
          const displayItemStatus = getDisplayItemStatus(item);
          agg.itemStatusCounts[displayItemStatus] = (agg.itemStatusCounts[displayItemStatus] ?? 0) + 1;

          agg.qtyRequested += asNumber(item.requested_qty);
          agg.qtyApproved += asNumber(item.approved_qty);
          agg.qtyReleased += asNumber(item.released_qty);
          agg.qtyReceived += asNumber(item.received_qty);

          if (isWarehouseDeferred(item)) agg.deferredItems += 1;

          agg.materialLines.push({
            request_id: r.id,
            item_id: rawItem.id,
            request_no: r.request_no,
            request_date: r.created_at ?? null,
            request_status: displayReqStatus,
            item_status: displayItemStatus,
            description: rawItem.description?.trim() || '—',
            unit: rawItem.unit?.trim() || '—',
            purpose: rawItem.purpose ?? item.purpose ?? null,
            requested_qty: asNumber(item.requested_qty),
            approved_qty: asNumber(item.approved_qty),
            released_qty: asNumber(item.released_qty),
            received_qty: asNumber(item.received_qty),
          });
        }

      }

      // Attach cost totals by project (optional).
      if (canViewCosts) {
        const { data: costRows, error: costErr } = await supabase
          .from('cost_records')
          .select('project_name, total_cost');

        if (costErr) throw costErr;

        const costByProject = new Map<string, number>();
        for (const row of costRows ?? []) {
          const project = row.project_name || '(Unassigned)';
          const cur = costByProject.get(project) ?? 0;
          costByProject.set(project, cur + asNumber(row.total_cost));
        }

        for (const [k, agg] of byProject.entries()) {
          agg.totalCost = costByProject.get(k) ?? 0;
        }
      }

      const result = Array.from(byProject.values()).map(agg => {
        const materialLines = [...agg.materialLines].sort((a, b) => {
          const byRequest = a.request_no.localeCompare(b.request_no);
          if (byRequest !== 0) return byRequest;
          return a.description.localeCompare(b.description);
        });
        return { ...agg, materialLines };
      });

      result.sort((a, b) => (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) - (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0));

      setSummaries(result);
      setLoading(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load project summary');
      setLoading(false);
    }
  }, [profile, supabase, canViewCosts]);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => load({ silent: true }), !!profile);

  const projectOptions = useMemo(() => {
    const names = summaries.map(s => s.project_name);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [summaries]);

  const visibleSummaries = useMemo(() => {
    if (selectedProject === 'all') return summaries;
    return summaries.filter(s => s.project_name === selectedProject);
  }, [summaries, selectedProject]);

  const dateToMin = dateFrom ? new Date(`${dateFrom}T00:00:00`) : undefined;
  const dateFromMax = dateTo ? new Date(`${dateTo}T00:00:00`) : undefined;

  if (!profile || (loading && summaries.length === 0)) {
    return (
      <AppShell title="Project Summary">
        <PageLoader />
      </AppShell>
    );
  }

  return (
    <AppShell title="Project Summary">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">By Project Summary</h2>
            <p className="page-subtitle">
              Aggregated request + item progress{canViewCosts ? ' + costs' : ''}. Printable report.
            </p>
          </div>

          <div className="no-print flex items-end gap-3 flex-wrap">
            <div className="min-w-[260px] w-full sm:w-[320px]">
              <label className="text-xs font-medium text-gray-500">Project</label>
              <Select
                value={selectedProject}
                onValueChange={v => setSelectedProject(v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All visible projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visible projects</SelectItem>
                  {projectOptions.map(name => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-[180px]">
              <label className="text-xs font-medium text-gray-500">From</label>
              <DatePicker
                value={dateFrom}
                onChange={setDateFrom}
                maxDate={dateFromMax}
                placeholder="From date"
                className="mt-1"
              />
            </div>

            <div className="w-full sm:w-[180px]">
              <label className="text-xs font-medium text-gray-500">To</label>
              <DatePicker
                value={dateTo}
                onChange={setDateTo}
                minDate={dateToMin}
                placeholder="To date"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {visibleSummaries.length === 0 ? (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-gray-500" />
              <div>
                <p className="font-semibold">No data found</p>
                <p className="text-sm text-gray-500">No material requests match your visibility.</p>
              </div>
            </div>
          </div>
        ) : (
          <div id="project-summary-print">
            {visibleSummaries.map(s => {
              const requestsTotal = s.requestCount;
              return (
                <section
                  key={s.project_name}
                  className="glass-card p-6 mb-5 page-break-avoid"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{s.project_name}</h3>
                      {s.department ? <p className="text-sm text-gray-500">{s.department}</p> : null}
                      <p className="text-xs text-gray-400 mt-1">
                        Updated: {s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <button
                        type="button"
                        className="no-print btn-secondary px-4 py-2.5 shrink-0"
                        onClick={() => handlePrint(s)}
                      >
                        <Printer size={16} /> Print
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="stat-card">
                      <p className="text-xs text-gray-500">Requests</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{requestsTotal}</p>
                    </div>
                    <div className="stat-card">
                      <p className="text-xs text-gray-500">Approved</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(s.qtyApproved)}</p>
                    </div>
                    <div className="stat-card">
                      <p className="text-xs text-gray-500">Released</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(s.qtyReleased)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <h4 className="section-label mb-2">Request Status (display)</h4>
                      <table className="glass-table table-fixed w-full">
                        <colgroup>
                          <col />
                          <col className="w-16" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th className="!text-right">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {REQUEST_STATUS_ORDER.map(st => {
                            const count = s.requestStatusCounts[st] ?? 0;
                            if (count === 0) return null;
                            const cfg = REQUEST_STATUS_CONFIG[st];
                            return (
                              <tr key={st}>
                                <td>
                                  <span className={`badge ${cfg.color}`}>{cfg.label}</span>
                                </td>
                                <td className="!text-right font-medium tabular-nums">{count}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h4 className="section-label mb-2">Item Status (display)</h4>
                      <table className="glass-table table-fixed w-full">
                        <colgroup>
                          <col />
                          <col className="w-16" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th className="!text-right">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ITEM_STATUS_ORDER.map(st => {
                            const count = s.itemStatusCounts[st] ?? 0;
                            if (count === 0) return null;
                            const cfg = ITEM_STATUS_CONFIG[st];
                            return (
                              <tr key={st}>
                                <td>
                                  <span className={`badge ${cfg.color}`}>{cfg.label}</span>
                                </td>
                                <td className="!text-right font-medium tabular-nums">{count}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ProjectSummaryPrintDialog
        open={printDialogOpen}
        summary={printSummary}
        onOpenChange={setPrintDialogOpen}
        canSaveCosts={canViewCosts}
        userId={profile?.id ?? null}
        onCostsSaved={() => load({ silent: true })}
      />
    </AppShell>
  );
}

