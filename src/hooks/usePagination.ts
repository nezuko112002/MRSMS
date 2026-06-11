'use client';

import { useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE, getPageRange, paginateSlice } from '@/lib/pagination';

export function usePagination<T>(items: T[], resetDeps: unknown[] = []) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  const totalItems = items.length;
  const range = getPageRange(page, totalItems);

  const paginatedItems = useMemo(
    () => paginateSlice(items, range.safePage),
    [items, range.safePage]
  );

  useEffect(() => {
    if (page > range.totalPages) setPage(range.totalPages);
  }, [page, range.totalPages]);

  return {
    page: range.safePage,
    setPage,
    paginatedItems,
    totalPages: range.totalPages,
    totalItems,
    from: range.from,
    to: range.to,
    pageSize: PAGE_SIZE,
  };
}
