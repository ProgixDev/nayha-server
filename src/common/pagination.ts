/** Page of a list returned to the admin. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
  /** Supabase .range() bounds for this page (inclusive). */
  from: number;
  to: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Reads ?page=&pageSize= safely: page from 1, page size 1 to 100. */
export function pageRequest(query: {
  page?: string | number;
  pageSize?: string | number;
}): PageRequest {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(query.pageSize)) || DEFAULT_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

/** Page of a list already filtered in memory. */
export function paginateArray<T>(
  items: T[],
  request: PageRequest,
): Paginated<T> {
  return {
    items: items.slice(request.from, request.to + 1),
    total: items.length,
    page: request.page,
    pageSize: request.pageSize,
  };
}

/** Text used in a search: lower case, accents removed. */
export function searchable(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
