'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function TablePagination({
  page,
  totalPages,
  totalItems,
  from,
  to,
  onPageChange,
  className,
}: TablePaginationProps) {
  if (totalItems === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-white/10',
        className
      )}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Showing <span className="font-medium text-gray-700 dark:text-gray-300">{from}–{to}</span> of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">{totalItems}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
          Prev
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[4.5rem] text-center">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          aria-label="Next page"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
