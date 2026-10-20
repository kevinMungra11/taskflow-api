import { describe, expect, it } from 'vitest';
import { paginationSchema, toLimitOffset, toPage } from '../src/utils/pagination.js';

describe('pagination', () => {
  it('applies defaults', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces query string values', () => {
    expect(paginationSchema.parse({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10 });
  });

  it('rejects out of range values', () => {
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('converts page numbers to limit/offset', () => {
    expect(toLimitOffset({ page: 1, pageSize: 20 })).toEqual({ limit: 20, offset: 0 });
    expect(toLimitOffset({ page: 3, pageSize: 10 })).toEqual({ limit: 10, offset: 20 });
  });

  it('computes total pages', () => {
    expect(toPage([], 41, { page: 1, pageSize: 20 }).totalPages).toBe(3);
    expect(toPage([], 0, { page: 1, pageSize: 20 }).totalPages).toBe(0);
  });
});
