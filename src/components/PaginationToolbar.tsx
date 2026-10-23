import React, { useState, useEffect, useMemo } from 'react';
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Language, Theme } from '../types';

export interface PaginationResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Utility to calculate page slice and pagination metadata for an array of items.
 * Guaranteed O(1) slice extraction after filter/sort.
 */
export function paginateArray<T>(
  items: T[] | undefined | null,
  page: number = 1,
  pageSize: number = 15
): PaginationResult<T> {
  const safeItems = Array.isArray(items) ? items : [];
  const validPageSize = Math.max(1, pageSize || 15);
  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / validPageSize));
  const validPage = Math.max(1, Math.min(page || 1, totalPages));
  const startIndex = (validPage - 1) * validPageSize;
  const endIndex = Math.min(startIndex + validPageSize, totalItems);
  const sliced = safeItems.slice(startIndex, endIndex);

  return {
    items: sliced,
    totalItems,
    totalPages,
    currentPage: validPage,
    pageSize: validPageSize,
    startIndex,
    endIndex,
  };
}

/**
 * Custom hook for paginating a list of items with automatic out-of-bounds page recovery
 * and filter-change reset support.
 */
export function usePaginatedList<T>(items: T[] | undefined | null, defaultPageSize = 15) {
  const safeItems = Array.isArray(items) ? items : [];
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize || 15);

  const validPageSize = Math.max(1, pageSize || 15);
  const totalPages = Math.max(1, Math.ceil(safeItems.length / validPageSize));

  // Auto-correct page if out of bounds (e.g. after search filter shrinks total results)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const result = useMemo(() => {
    return paginateArray(safeItems, currentPage, validPageSize);
  }, [safeItems, currentPage, validPageSize]);

  const resetPage = () => setCurrentPage(1);

  return {
    ...result,
    setCurrentPage,
    setPageSize,
    resetPage,
  };
}

export interface PaginationToolbarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  language?: Language;
  isRtl?: boolean;
  theme?: Theme;
  className?: string;
}

export const PaginationToolbar: React.FC<PaginationToolbarProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 20, 50, 100],
  language = 'ar',
  isRtl: propIsRtl,
  theme = 'light',
  className = '',
}) => {
  const isRtl = propIsRtl !== undefined ? propIsRtl : language === 'ar';

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const handleFirst = () => {
    if (canPrev) onPageChange(1);
  };

  const handlePrev = () => {
    if (canPrev) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (canNext) onPageChange(currentPage + 1);
  };

  const handleLast = () => {
    if (canNext) onPageChange(totalPages);
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-4 rounded-xl border ${
        theme === 'dark'
          ? 'bg-slate-800/60 border-slate-700/60 text-slate-300'
          : 'bg-slate-50 border-slate-200/80 text-slate-600'
      } text-xs select-none ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Items Range Info */}
      <div className="flex items-center gap-2 font-medium">
        <span>
          {isRtl
            ? `عرض ${startIndex}-${endIndex} من إجمالي ${totalItems} سجل`
            : `Showing ${startIndex}-${endIndex} of ${totalItems} items`}
        </span>
      </div>

      {/* Navigation and Size Selector */}
      <div className="flex items-center gap-3">
        {/* Page Size Selector */}
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">
              {isRtl ? 'العدد بالصفحة:' : 'Rows per page:'}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className={`py-1 px-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              {(pageSizeOptions || [10, 15, 20, 50, 100]).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page Navigation Buttons */}
        <div className="flex items-center gap-1">
          {/* First Page */}
          <button
            type="button"
            onClick={handleFirst}
            disabled={!canPrev}
            title={isRtl ? 'الصفحة الأولى' : 'First Page'}
            className={`p-1.5 rounded-lg border transition-all ${
              canPrev
                ? 'hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 cursor-pointer'
                : 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
            }`}
          >
            {isRtl ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>

          {/* Prev Page */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={!canPrev}
            title={isRtl ? 'الصفحة السابقة' : 'Previous Page'}
            className={`p-1.5 rounded-lg border transition-all ${
              canPrev
                ? 'hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 cursor-pointer'
                : 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
            }`}
          >
            {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Page Indicator */}
          <span className="px-3 py-1 rounded-lg font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center min-w-[70px]">
            {isRtl
              ? `ص ${currentPage} / ${totalPages}`
              : `${currentPage} / ${totalPages}`}
          </span>

          {/* Next Page */}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            title={isRtl ? 'الصفحة التالية' : 'Next Page'}
            className={`p-1.5 rounded-lg border transition-all ${
              canNext
                ? 'hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 cursor-pointer'
                : 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
            }`}
          >
            {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* Last Page */}
          <button
            type="button"
            onClick={handleLast}
            disabled={!canNext}
            title={isRtl ? 'الصفحة الأخيرة' : 'Last Page'}
            className={`p-1.5 rounded-lg border transition-all ${
              canNext
                ? 'hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 cursor-pointer'
                : 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
            }`}
          >
            {isRtl ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};
