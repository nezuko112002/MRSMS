export const PAGE_SIZE = 20;

export function getTotalPages(totalItems: number): number {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
}

export function paginateSlice<T>(items: T[], page: number): T[] {
  const totalPages = getTotalPages(items.length);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export function getPageRange(page: number, totalItems: number): {
  from: number;
  to: number;
  totalPages: number;
  safePage: number;
} {
  const totalPages = getTotalPages(totalItems);
  const safePage = Math.min(Math.max(1, page), totalPages);
  if (totalItems === 0) {
    return { from: 0, to: 0, totalPages, safePage };
  }
  const from = (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, totalItems);
  return { from, to, totalPages, safePage };
}
