import type { ListeningPort, Resource } from '../../shared/schema';
import { containerPath, pve, type ContainerStatus } from './pve';
import { helper } from './helper';

interface Sample<T> { data: T | null; updatedAt: number | null; error: string | null }
const cache = new Map<string, { expires: number; sample: Sample<unknown>; pending?: Promise<Sample<unknown>> }>();
async function sample<T>(key: string, seconds: number, read: () => Promise<T>): Promise<Sample<T>> {
  const old = cache.get(key);
  if (old && old.expires > Date.now()) return old.sample as Sample<T>;
  if (old?.pending) return old.pending as Promise<Sample<T>>;
  const entry = old || { expires: 0, sample: { data: null, updatedAt: null, error: null } };
  entry.pending = (async () => {
    try { entry.sample = { data: await read(), updatedAt: Date.now(), error: null }; }
    catch (error) { entry.sample = { ...entry.sample, error: error instanceof Error ? error.message : '采集失败' }; }
    entry.expires = Date.now() + seconds * 1000; entry.pending = undefined;
    return entry.sample;
  })();
  cache.set(key, entry);
  return entry.pending as Promise<Sample<T>>;
}
export async function monitor(resource: Resource, ports = false) {
  if (ports) return sample<ListeningPort[]>('ports:' + resource.id, 15, async () => {
    const state = await pve<ContainerStatus>(containerPath(resource.vmid) + '/status/current');
    if (state.status !== 'running') return [];
    return helper<ListeningPort[]>({ operation: 'ports', vmid: resource.vmid });
  });
  return sample('status:' + resource.id, 5, () => pve<ContainerStatus>(containerPath(resource.vmid) + '/status/current'));
}
export function history(resource: Resource) {
  return sample('history:' + resource.id, 60, () => pve<Record<string, number>[]>(containerPath(resource.vmid) + '/rrddata', 'GET', { timeframe: 'hour', cf: 'AVERAGE' }));
}
