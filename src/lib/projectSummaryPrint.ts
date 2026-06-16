import {
  formatNumber,
  ITEM_STATUS_CONFIG,
  REQUEST_STATUS_CONFIG,
} from '@/lib/utils';
import type { ItemStatus, RequestStatus } from '@/types';

export type ProjectSummaryMaterialLine = {
  request_no: string;
  request_date: string | null;
  request_status: RequestStatus;
  item_status: ItemStatus;
  description: string;
  unit: string;
  purpose: string | null;
  requested_qty: number;
  approved_qty: number;
  released_qty: number;
  received_qty: number;
};

export type ProjectSummaryPrintData = {
  project_name: string;
  department: string | null;
  requestCount: number;
  requestStatusCounts: Partial<Record<RequestStatus, number>>;
  itemStatusCounts: Partial<Record<ItemStatus, number>>;
  qtyReleased: number;
  qtyApproved: number;
  deferredItems: number;
  totalCost: number | null;
  lastActivityAt: string | null;
  materialLines: ProjectSummaryMaterialLine[];
};

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

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    color: #111;
    background: #fff;
  }
  .report {
    width: 100%;
    max-width: none;
    margin: 0 auto;
  }
  .report-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 2px solid #111;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .report-brand {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
    margin-bottom: 6px;
  }
  .report-title {
    font-size: 20pt;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .report-subtitle {
    font-size: 10pt;
    color: #444;
    margin: 0;
  }
  .report-meta {
    text-align: right;
    font-size: 9pt;
    color: #444;
    line-height: 1.5;
  }
  .report-meta strong {
    display: block;
    font-size: 11pt;
    color: #111;
    margin-top: 4px;
  }
  .section {
    margin-bottom: 22px;
  }
  .section-title {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #333;
    margin: 0 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #bbb;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
  }
  th, td {
    border: 1px solid #333;
    padding: 7px 10px;
    vertical-align: top;
  }
  th {
    background: #ececec;
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td.num, th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .metrics th, .metrics td {
    text-align: center;
  }
  .metrics td.value {
    font-size: 14pt;
    font-weight: 700;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .mono {
    font-family: Consolas, "Courier New", monospace;
    font-size: 10pt;
  }
  .materials-table {
    table-layout: fixed;
    width: 100%;
    font-size: 8pt;
  }
  .materials-table thead th {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
    line-height: 1.15;
    padding: 3px 2px;
    text-align: center;
    vertical-align: middle;
    white-space: normal;
    overflow: visible;
    word-wrap: normal;
  }
  .materials-table th,
  .materials-table td {
    padding: 4px 3px;
    overflow: hidden;
    word-wrap: break-word;
  }
  .materials-table th.num,
  .materials-table td.num {
    text-align: center;
    white-space: nowrap;
  }
  .materials-table td.mono {
    font-family: Consolas, "Courier New", monospace;
    font-size: 6.5pt;
    white-space: nowrap;
    letter-spacing: -0.02em;
    text-align: center;
  }
  .materials-table .col-material {
    word-break: break-word;
    font-size: 7.5pt;
  }
  .materials-table .col-purpose {
    word-break: break-word;
    font-size: 7pt;
  }
  .materials-table .nowrap {
    white-space: nowrap;
    font-size: 7pt;
    text-align: center;
  }
  .blank-cell {
    width: 100%;
    height: 22px;
    background: #fafafa;
  }
  .grand-total td {
    border-top: 2px solid #111;
    font-weight: 700;
    background: #f5f5f5;
  }
  .grand-total .blank-cell {
    height: 26px;
  }
  .footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #ccc;
    font-size: 8.5pt;
    color: #666;
    text-align: center;
  }
  @page { margin: 1cm; }
  @media print {
    body { padding: 0; }
    .report { width: 100%; max-width: none; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRequestDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function sanitizePrintFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Project Summary';
}

function isRequestDateInRange(
  requestDate: string | null,
  dateFrom: string,
  dateTo: string,
) {
  if (!dateFrom && !dateTo) return true;
  if (!requestDate) return false;

  const date = new Date(requestDate);
  if (Number.isNaN(date.getTime())) return false;

  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00`);
    if (date < start) return false;
  }

  if (dateTo) {
    const end = new Date(`${dateTo}T23:59:59.999`);
    if (date > end) return false;
  }

  return true;
}

export function filterProjectSummaryByDateRange(
  summary: ProjectSummaryPrintData,
  dateFrom: string,
  dateTo: string,
): ProjectSummaryPrintData {
  if (!dateFrom && !dateTo) return summary;

  const materialLines = summary.materialLines.filter(line =>
    isRequestDateInRange(line.request_date, dateFrom, dateTo),
  );

  const requestStatusCounts: Partial<Record<RequestStatus, number>> = {};
  const itemStatusCounts: Partial<Record<ItemStatus, number>> = {};
  const seenRequests = new Set<string>();
  let qtyApproved = 0;
  let qtyReleased = 0;

  for (const line of materialLines) {
    if (!seenRequests.has(line.request_no)) {
      seenRequests.add(line.request_no);
      requestStatusCounts[line.request_status] = (requestStatusCounts[line.request_status] ?? 0) + 1;
    }

    itemStatusCounts[line.item_status] = (itemStatusCounts[line.item_status] ?? 0) + 1;
    qtyApproved += line.approved_qty;
    qtyReleased += line.released_qty;
  }

  return {
    ...summary,
    requestCount: seenRequests.size,
    requestStatusCounts,
    itemStatusCounts,
    qtyApproved,
    qtyReleased,
    materialLines,
  };
}

function statusRows(
  order: readonly string[],
  counts: Partial<Record<string, number>>,
  config: Record<string, { label: string }>,
) {
  const rows = order
    .map(status => {
      const count = counts[status] ?? 0;
      if (count === 0) return '';
      const label = config[status]?.label ?? status;
      return `<tr><td>${escapeHtml(label)}</td><td class="num">${count}</td></tr>`;
    })
    .filter(Boolean)
    .join('');

  return rows || '<tr><td colspan="2">No data</td></tr>';
}

function materialRows(lines: ProjectSummaryMaterialLine[]) {
  if (!lines.length) {
    return '<tr><td colspan="10">No materials</td></tr>';
  }

  const rows = lines
    .map(line => {
      const purpose = line.purpose?.trim() || '—';
      return `<tr>
        <td class="mono">${escapeHtml(line.request_no)}</td>
        <td class="nowrap">${escapeHtml(formatRequestDate(line.request_date))}</td>
        <td class="col-material">${escapeHtml(line.description)}</td>
        <td>${escapeHtml(line.unit)}</td>
        <td class="blank-cell">&nbsp;</td>
        <td class="num">${escapeHtml(formatNumber(line.requested_qty))}</td>
        <td class="num">${escapeHtml(formatNumber(line.approved_qty))}</td>
        <td class="num">${escapeHtml(formatNumber(line.released_qty))}</td>
        <td class="col-purpose">${escapeHtml(purpose)}</td>
        <td class="blank-cell num">&nbsp;</td>
      </tr>`;
    })
    .join('');

  return `${rows}
    <tr class="grand-total">
      <td colspan="9" class="num">Grand Total</td>
      <td class="blank-cell num">&nbsp;</td>
    </tr>`;
}

export function buildProjectSummaryPrintHtml(
  summary: ProjectSummaryPrintData,
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title></title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <div class="report">
      <div class="report-top">
        <div>
          <p class="report-brand">MRSMS — Material Request &amp; Stock Management System</p>
          <h1 class="report-title">${escapeHtml(summary.project_name)}</h1>
          ${summary.department ? `<p class="report-subtitle">${escapeHtml(summary.department)}</p>` : ''}
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">Summary</h2>
        <table class="metrics">
          <thead>
            <tr>
              <th>Requests</th>
              <th>Approved</th>
              <th>Released</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="value">${summary.requestCount}</td>
              <td class="value">${escapeHtml(formatNumber(summary.qtyApproved))}</td>
              <td class="value">${escapeHtml(formatNumber(summary.qtyReleased))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2 class="section-title">Materials</h2>
        <table class="materials-table">
          <colgroup>
            <col style="width:12%" />
            <col style="width:8%" />
            <col style="width:12%" />
            <col style="width:6%" />
            <col style="width:7%" />
            <col style="width:8%" />
            <col style="width:8%" />
            <col style="width:8%" />
            <col style="width:10%" />
            <col style="width:11%" />
          </colgroup>
          <thead>
            <tr>
              <th>Req.<br />No.</th>
              <th>Date<br />Req.</th>
              <th>Material</th>
              <th>Unit</th>
              <th class="num">Cost</th>
              <th class="num">Req.<br />Qty</th>
              <th class="num">Appr.<br />Qty</th>
              <th class="num">Rel.<br />Qty</th>
              <th>Purpose</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${materialRows(summary.materialLines)}
          </tbody>
        </table>
      </div>

      <div class="section two-col">
        <div>
          <h2 class="section-title">Request Status</h2>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th class="num">Count</th>
              </tr>
            </thead>
            <tbody>
              ${statusRows(REQUEST_STATUS_ORDER, summary.requestStatusCounts, REQUEST_STATUS_CONFIG)}
            </tbody>
          </table>
        </div>
        <div>
          <h2 class="section-title">Item Status</h2>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th class="num">Count</th>
              </tr>
            </thead>
            <tbody>
              ${statusRows(ITEM_STATUS_ORDER, summary.itemStatusCounts, ITEM_STATUS_CONFIG)}
            </tbody>
          </table>
        </div>
      </div>

      <p class="footer">Project summary report — ${escapeHtml(summary.project_name)}</p>
    </div>
  </body>
</html>`;
}

export function printProjectSummary(summary: ProjectSummaryPrintData) {
  const html = buildProjectSummaryPrintHtml(summary);
  const printFilename = sanitizePrintFilename(summary.project_name);
  const previousTitle = document.title;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const triggerPrint = () => {
    // Parent title drives the default PDF filename; iframe title avoids project name in print header.
    document.title = printFilename;
    if (win.document) {
      win.document.title = '';
    }
    win.focus();
    win.print();
    window.setTimeout(() => {
      document.title = previousTitle;
      document.body.removeChild(iframe);
    }, 1000);
  };

  if (iframe.contentDocument?.readyState === 'complete') {
    triggerPrint();
  } else {
    iframe.onload = triggerPrint;
  }
}
