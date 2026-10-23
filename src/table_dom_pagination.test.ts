import { describe, it, expect } from 'vitest';
import { paginateArray } from './components/PaginationToolbar';

describe('Phase 5: DOM Pagination & Slice Calculation Unit Tests', () => {
  it('should accurately paginate an empty array', () => {
    const result = paginateArray([], 1, 15);
    expect(result.items).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.currentPage).toBe(1);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(0);
  });

  it('should calculate correct slice and boundaries for page 1 of 45 items', () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ id: `id-${i + 1}`, val: i + 1 }));
    const result = paginateArray(items, 1, 10);
    expect(result.items.length).toBe(10);
    expect(result.items[0].id).toBe('id-1');
    expect(result.items[9].id).toBe('id-10');
    expect(result.totalItems).toBe(45);
    expect(result.totalPages).toBe(5);
    expect(result.currentPage).toBe(1);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(10);
  });

  it('should calculate correct slice for the last page with partial count', () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ id: `id-${i + 1}`, val: i + 1 }));
    const result = paginateArray(items, 5, 10);
    expect(result.items.length).toBe(5);
    expect(result.items[0].id).toBe('id-41');
    expect(result.items[4].id).toBe('id-45');
    expect(result.totalItems).toBe(45);
    expect(result.totalPages).toBe(5);
    expect(result.currentPage).toBe(5);
    expect(result.startIndex).toBe(40);
    expect(result.endIndex).toBe(45);
  });

  it('should auto-clamp page numbers out of bounds (above totalPages or below 1)', () => {
    const items = Array.from({ length: 20 }, (_, i) => i + 1);
    const overPage = paginateArray(items, 999, 10);
    expect(overPage.currentPage).toBe(2);
    expect(overPage.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

    const underPage = paginateArray(items, -5, 10);
    expect(underPage.currentPage).toBe(1);
    expect(underPage.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
