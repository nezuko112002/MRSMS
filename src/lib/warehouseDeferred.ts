import type { MaterialRequestItem } from '@/types';

export const WAREHOUSE_DEFERRED_MARKER = '[warehouse:deferred]';

export function isWarehouseDeferred(
  item: Pick<MaterialRequestItem, 'release_deferred' | 'remarks'>
): boolean {
  return !!item.release_deferred || (item.remarks?.includes(WAREHOUSE_DEFERRED_MARKER) ?? false);
}

export function markWarehouseDeferred(remarks: string | null): string {
  if (remarks?.includes(WAREHOUSE_DEFERRED_MARKER)) return remarks;
  const base = clearWarehouseDeferredMarker(remarks);
  return base ? `${base}\n${WAREHOUSE_DEFERRED_MARKER}` : WAREHOUSE_DEFERRED_MARKER;
}

export function clearWarehouseDeferredMarker(remarks: string | null): string | null {
  if (!remarks) return null;
  const cleaned = remarks
    .replace(new RegExp(`\\n?${WAREHOUSE_DEFERRED_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '')
    .trim();
  return cleaned || null;
}
