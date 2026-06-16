import {
  formatDate,
  formatNumber,
  getApprovedQty,
  getDisplayRequestStatus,
  getRemainingReleaseQty,
  itemNeedsMoreRelease,
  REQUEST_STATUS_CONFIG,
} from '@/lib/utils';
import type { MaterialRequest, MaterialRequestItem, RequestStatus } from '@/types';

export type WarehouseReleasePrintItem = {
  description: string;
  unit: string;
  approved_qty: number;
  released_qty: number;
  remaining_qty: number;
  purpose: string | null;
};

export type WarehouseReleasePrintData = {
  request_no: string;
  project_name: string;
  department: string | null;
  requested_by: string | null;
  required_date: string | null;
  created_at: string | null;
  status: RequestStatus;
  items: WarehouseReleasePrintItem[];
};

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
    border-bottom: 2px solid #111;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .report-brand {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
    margin: 0 0 6px;
  }
  .report-title {
    font-size: 18pt;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .report-subtitle {
    font-size: 10pt;
    color: #444;
    margin: 0;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 24px;
    margin-top: 14px;
    font-size: 9.5pt;
  }
  .meta-label {
    color: #666;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .meta-value {
    font-weight: 600;
    color: #111;
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
    padding: 6px 8px;
    vertical-align: top;
  }
  th {
    background: #ececec;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td.num, th.num {
    text-align: center;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .items-table {
    table-layout: fixed;
    font-size: 8.5pt;
  }
  .items-table .col-material {
    word-break: break-word;
  }
  .items-table .col-purpose {
    word-break: break-word;
    font-size: 8pt;
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
  }
`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizePrintFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Release';
}

type RequestItemFields = Pick<
  MaterialRequestItem,
  'status' | 'release_deferred' | 'purpose' | 'approved_qty' | 'released_qty' | 'requested_qty' | 'description' | 'unit'
>;

export function buildWarehouseReleasePrintData(
  request: MaterialRequest & {
    profile?: { full_name: string };
    items?: RequestItemFields[];
  },
): WarehouseReleasePrintData {
  const items = (request.items ?? []).filter(item => itemNeedsMoreRelease(item));

  return {
    request_no: request.request_no,
    project_name: request.project_name,
    department: request.department ?? null,
    requested_by: request.profile?.full_name ?? null,
    required_date: request.required_date,
    created_at: request.created_at ?? null,
    status: getDisplayRequestStatus(
      { status: request.status },
      request.items ?? [],
    ),
    items: items.map(item => ({
      description: item.description?.trim() || '—',
      unit: item.unit?.trim() || '—',
      approved_qty: getApprovedQty(item),
      released_qty: Number(item.released_qty ?? 0) || 0,
      remaining_qty: getRemainingReleaseQty(item),
      purpose: item.purpose?.trim() || null,
    })),
  };
}

function itemRows(items: WarehouseReleasePrintItem[]) {
  if (!items.length) {
    return '<tr><td colspan="6">No items ready for release</td></tr>';
  }

  return items
    .map(item => `<tr>
      <td class="col-material">${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td class="num">${escapeHtml(formatNumber(item.approved_qty))}</td>
      <td class="num">${escapeHtml(formatNumber(item.released_qty))}</td>
      <td class="num">${escapeHtml(formatNumber(item.remaining_qty))}</td>
      <td class="col-purpose">${escapeHtml(item.purpose || '—')}</td>
    </tr>`)
    .join('');
}

export function buildWarehouseReleasePrintHtml(data: WarehouseReleasePrintData) {
  const statusLabel = REQUEST_STATUS_CONFIG[data.status]?.label ?? data.status;

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
        <p class="report-brand">MRSMS — Material Request &amp; Stock Management System</p>
        <h1 class="report-title">Release Pick List</h1>
        <p class="report-subtitle">${escapeHtml(data.request_no)}</p>

        <div class="meta-grid">
          <div>
            <div class="meta-label">Project</div>
            <div class="meta-value">${escapeHtml(data.project_name)}</div>
          </div>
          <div>
            <div class="meta-label">Status</div>
            <div class="meta-value">${escapeHtml(statusLabel)}</div>
          </div>
          <div>
            <div class="meta-label">Department</div>
            <div class="meta-value">${escapeHtml(data.department || '—')}</div>
          </div>
          <div>
            <div class="meta-label">Requested By</div>
            <div class="meta-value">${escapeHtml(data.requested_by || '—')}</div>
          </div>
          <div>
            <div class="meta-label">Date Requested</div>
            <div class="meta-value">${escapeHtml(data.created_at ? formatDate(data.created_at) : '—')}</div>
          </div>
          <div>
            <div class="meta-label">Required By</div>
            <div class="meta-value">${escapeHtml(formatDate(data.required_date))}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">Materials to Release</h2>
        <table class="items-table">
          <colgroup>
            <col style="width:28%" />
            <col style="width:10%" />
            <col style="width:12%" />
            <col style="width:12%" />
            <col style="width:14%" />
            <col style="width:24%" />
          </colgroup>
          <thead>
            <tr>
              <th>Material</th>
              <th>Unit</th>
              <th class="num">Approved</th>
              <th class="num">Released</th>
              <th class="num">To Release</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows(data.items)}
          </tbody>
        </table>
      </div>

      <p class="footer">Warehouse release pick list — ${escapeHtml(data.request_no)}</p>
    </div>
  </body>
</html>`;
}

export function printWarehouseRelease(
  request: MaterialRequest & {
    profile?: { full_name: string };
    items?: RequestItemFields[];
  },
) {
  const data = buildWarehouseReleasePrintData(request);
  const html = buildWarehouseReleasePrintHtml(data);
  const printFilename = sanitizePrintFilename(data.request_no);
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
