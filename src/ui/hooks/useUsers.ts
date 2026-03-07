import * as React from 'react';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/query';

type Filters = {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: 'all' | 'true' | 'false';
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CONCIERGE';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type PageResp = {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

async function fetchUsers(filters: Filters): Promise<PageResp> {
  const qs = new URLSearchParams();
  qs.set('page', String(filters.page ?? 1));
  qs.set('pageSize', String(filters.pageSize ?? 20));
  if (filters.search?.trim()) qs.set('search', filters.search.trim());
  if (filters.active && filters.active !== 'all') qs.set('active', filters.active);

  return api(`/v1/users?${qs.toString()}`, { method: 'GET', auth: true });
}

export function useUsers(filters: Filters) {
  const key = React.useMemo(
    () => ['users', filters.page ?? 1, filters.pageSize ?? 20, filters.search ?? '', filters.active ?? 'all'].join(':'),
    [filters.page, filters.pageSize, filters.search, filters.active]
  );

  const { data, loading, error } = useQuery<PageResp>(key, () => fetchUsers(filters), {
    enabled: true,
  });

  return {
    data:
      data ??
      ({
        items: [],
        total: 0,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        totalPages: 1,
      } as PageResp),
    loading,
    error,
    refetch: () => fetchUsers(filters),
  };
}
