'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogCloseButton,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import {
  applyMaterialCosts,
  computeMaterialLineTotal,
  materialLineKey,
  printProjectSummary,
  type ProjectSummaryPrintData,
} from '@/lib/projectSummaryPrint';

const MAX_UNIT_COST = 99_999_999.99;
const MAX_COST_WHOLE_DIGITS = 8;
const MAX_COST_DECIMALS = 2;

function sanitizeCostInput(value: string): string | null {
  if (value === '') return '';

  if (!/^\d*\.?\d*$/.test(value)) return null;

  const [whole = '', fraction = ''] = value.split('.');
  if (whole.length > MAX_COST_WHOLE_DIGITS) return null;
  if (fraction.length > MAX_COST_DECIMALS) return null;

  if (!value.endsWith('.')) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_UNIT_COST) return null;
  }

  return value;
}

function parseUnitCost(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '.') return null;

  const unitCost = Number(trimmed);
  if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > MAX_UNIT_COST) return null;

  return unitCost;
}

type Props = {
  open: boolean;
  summary: ProjectSummaryPrintData | null;
  onOpenChange: (open: boolean) => void;
};

export function ProjectSummaryPrintDialog({ open, summary, onOpenChange }: Props) {
  const [costs, setCosts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setCosts({});
    }
  }, [open, summary?.project_name]);

  const rows = useMemo(() => {
    if (!summary) return [];

    return summary.materialLines.map((line, index) => {
      const key = materialLineKey(line, index);
      const raw = costs[key] ?? '';
      const unitCost = parseUnitCost(raw);
      const lineTotal = unitCost != null ? computeMaterialLineTotal(unitCost, line.released_qty) : null;

      return { key, line, unitCost, lineTotal };
    });
  }, [summary, costs]);

  const grandTotal = useMemo(() => {
    const totals = rows.map(r => r.lineTotal).filter((v): v is number => v != null);
    if (!totals.length) return null;
    return totals.reduce((sum, n) => sum + n, 0);
  }, [rows]);

  function updateCost(key: string, value: string) {
    const sanitized = sanitizeCostInput(value);
    if (sanitized === null) return;
    setCosts(prev => ({ ...prev, [key]: sanitized }));
  }

  function handlePrint() {
    if (!summary) return;

    const costsByKey: Record<string, number> = {};
    for (const row of rows) {
      if (row.unitCost != null) {
        costsByKey[row.key] = row.unitCost;
      }
    }

    printProjectSummary(applyMaterialCosts(summary, costsByKey));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>Print — {summary?.project_name ?? 'Project'}</DialogTitle>
          <DialogDescription>
            Enter unit cost for each material (max ₱99,999,999.99). Total is cost × released qty.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-2">
          {!summary || summary.materialLines.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No materials to print.</p>
          ) : (
            <table className="glass-table w-full text-sm">
              <thead>
                <tr>
                  <th>Req. No.</th>
                  <th>Date Req.</th>
                  <th>Material</th>
                  <th>Unit</th>
                  <th className="!text-right">Req. Qty</th>
                  <th className="!text-right">Released</th>
                  <th className="!text-right w-36">Cost</th>
                  <th className="!text-right w-36">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, line, lineTotal }) => (
                  <tr key={key}>
                    <td className="font-mono text-xs text-brand-400">{line.request_no}</td>
                    <td className="whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {formatDate(line.request_date)}
                    </td>
                    <td>{line.description}</td>
                    <td>{line.unit}</td>
                    <td className="!text-right tabular-nums">{formatNumber(line.requested_qty)}</td>
                    <td className="!text-right tabular-nums">{formatNumber(line.released_qty)}</td>
                    <td className="!text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        maxLength={MAX_COST_WHOLE_DIGITS + 1 + MAX_COST_DECIMALS}
                        value={costs[key] ?? ''}
                        onChange={e => updateCost(key, e.target.value)}
                        className="glass-input w-full max-w-[120px] ml-auto text-right text-sm py-1.5"
                      />
                    </td>
                    <td className="!text-right tabular-nums font-medium text-gray-800 dark:text-gray-200">
                      {lineTotal != null ? formatCurrency(lineTotal) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="!text-right font-semibold text-gray-700 dark:text-gray-200">
                    Grand Total
                  </td>
                  <td className="!text-right font-bold text-gray-900 dark:text-white tabular-nums">
                    {grandTotal != null ? formatCurrency(grandTotal) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <DialogFooter>
          <button type="button" className="btn-secondary px-4 py-2" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2"
            onClick={handlePrint}
            disabled={!summary || summary.materialLines.length === 0}
          >
            <Printer size={16} /> Print
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
