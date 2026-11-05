import { useQuery } from '@tanstack/react-query';
import type { AdminStudent, Forward, Network, Profile, Resource, SafeSettings } from '../../shared/schema';
import { request } from './api';

export interface AdminOverview {
  students: AdminStudent[];
  resources: Resource[];
  profiles: Profile[];
  networks: Network[];
  taskCounts: { attention: number };
  forwards: Forward[];
}

/** Shared admin catalog; every admin route reads the same cached snapshot. */
export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => request<AdminOverview>('admin/overview'),
    refetchInterval: 5000,
  });
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => request<SafeSettings>('admin/settings') });
}
