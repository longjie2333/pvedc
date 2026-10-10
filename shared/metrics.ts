export interface Sample<T> { data: T | null; updatedAt: number | null; error: string | null }
export interface HostMetrics {
  node: string; cpu: number; cpus: number; cpuModel: string; uptime: number; version: string; load: number[];
  memory: { total: number; used: number; free: number };
  swap: { total: number; used: number; free: number };
  rootfs: { total: number; used: number; avail: number };
  storages: { name: string; type: string; active: boolean; used: number | null; total: number | null; available: number | null }[];
}
