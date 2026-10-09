import type { ListeningPort, Resource } from '../../shared/schema';
import { containerPath, nodePath, pve, type ContainerStatus, type NodeStatus } from './pve';
import { helper } from './helper';
import { getSettings } from './settings';
import type { HostMetrics, Sample } from '../../shared/metrics';

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

export function hostStatus() {
  const settings = getSettings();
  return sample<HostMetrics>('host:' + settings.pveUrl + ':' + settings.pveNode, 5, async () => {
    const [node, storages] = await Promise.all([
      pve<NodeStatus & { cpuinfo: { cpus: number; model: string }; swap: HostMetrics['swap']; rootfs: HostMetrics['rootfs']; loadavg: string[]; pveversion: string }>(nodePath() + '/status'),
      pve<{ storage: string; type: string; active: number; enabled: number; total?: number; used?: number; avail?: number }[]>(nodePath() + '/storage'),
    ]);
    return { node: settings.pveNode, cpu: node.cpu, cpus: node.cpuinfo.cpus, cpuModel: node.cpuinfo.model, uptime: node.uptime, version: node.pveversion,
      load: node.loadavg.map(Number), memory: node.memory, swap: node.swap, rootfs: node.rootfs,
      storages: storages.map(storage => ({ name: storage.storage, type: storage.type, active: Number(storage.active) === 1 && Number(storage.enabled) === 1,
        used: storage.used ?? null, total: storage.total ?? null, available: storage.avail ?? null })),
    };
  });
}

export function hostHistory() {
  const settings = getSettings();
  return sample('host-history:' + settings.pveUrl + ':' + settings.pveNode, 60, () => pve<Record<string, number>[]>(nodePath() + '/rrddata', 'GET', { timeframe: 'hour', cf: 'AVERAGE' }));
}
