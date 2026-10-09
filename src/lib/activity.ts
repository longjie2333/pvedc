import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PageResult } from '../../shared/activity';
import { request } from './api';

export function useActivityRecords<T>(path: string, enabled: boolean) {
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
  const [draft, setDraft] = useState<Record<string, string>>({}), [filters, setFilters] = useState<Record<string, string>>({});
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value.trim()) {
    params.set(key, ['from', 'to'].includes(key) ? String(Math.floor(new Date(value + (key === 'from' ? 'T00:00:00' : 'T23:59:59')).getTime() / 1000)) : value.trim());
  }
  const query = useQuery({ queryKey: ['activity', path, params.toString()], queryFn: () => request<PageResult<T>>(path + '?' + params), enabled, refetchInterval: enabled ? 5000 : false });
  useEffect(() => { if (query.data && query.data.page !== page) setPage(query.data.page); }, [query.data, page]);
  return {
    query, page, pageSize, draft, setPage,
    setPageSize: (size: number) => { setPageSize(size); setPage(1); },
    setFilter: (key: string, value: string) => setDraft(previous => ({ ...previous, [key]: value })),
    search: () => { setFilters({ ...draft }); setPage(1); },
    reset: () => { setDraft({}); setFilters({}); setPage(1); },
  };
}
