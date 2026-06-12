import type { MaterialRequestItem } from '@/types';

export const WAREHOUSE_DEFERRED_MARKER = '[warehouse:deferred]';

export function isWarehouseDeferred(
  item: Pick<MaterialRequestItem, 'release_deferred' | 'purpose'>
): boolean {
  return !!item.release_deferred || (item.purpose?.includes(WAREHOUSE_DEFERRED_MARKER) ?? false);
}

export function markWarehouseDeferred(purpose: string | null): string {
  if (purpose?.includes(WAREHOUSE_DEFERRED_MARKER)) return purpose;
  const base = clearWarehouseDeferredMarker(purpose);
  return base ? `${base}\n${WAREHOUSE_DEFERRED_MARKER}` : WAREHOUSE_DEFERRED_MARKER;
}

export function clearWarehouseDeferredMarker(purpose: string | null): string | null {
  if (!purpose) return null;
  const cleaned = purpose
    .replace(new RegExp(`\\n?${WAREHOUSE_DEFERRED_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '')
    .trim();
  return cleaned || null;
}
