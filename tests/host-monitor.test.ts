import { afterEach, expect, it, vi } from 'vitest';
const upstream = vi.hoisted(() => ({ pve: vi.fn(), settings: { pveUrl: 'https://host', pveNode: 'node' } }));
vi.mock('../server/lib/pve', () => ({ pve: upstream.pve, nodePath: () => '/nodes/node' }));
vi.mock('../server/lib/settings', () => ({ getSettings: () => upstream.settings }));
import { hostStatus, hostHistory } from '../server/lib/monitor';

afterEach(() => vi.useRealTimers());
it('samples only node status/storage, deduplicates concurrent reads and retains dated stale data on failure', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(100000);
  upstream.pve.mockImplementation(async (path: string) => path.endsWith('/status') ? {
    cpu: 0.2, cpuinfo: { cpus: 24, model: 'Test CPU' }, memory: { total: 100, used: 30, free: 70 }, swap: { total: 10, used: 0, free: 10 },
    rootfs: { total: 100, used: 50, avail: 50 }, loadavg: ['1','2','3'], uptime: 600, pveversion: 'PVE test',
  } : [{ storage: 'local', type: 'dir', active: 1, enabled: 1, total: 100, used: 20, avail: 80 }]);
  const [first, second] = await Promise.all([hostStatus(), hostStatus()]);
  expect(upstream.pve).toHaveBeenCalledTimes(2);
  expect(first).toEqual(second);
  expect(first.data).toMatchObject({ cpu: 0.2, cpus: 24, cpuModel: 'Test CPU', load: [1, 2, 3] });
  expect(first.data?.storages[0].available).toBe(80);
  expect(first.updatedAt).toBe(100000);
  vi.setSystemTime(106000);
  upstream.pve.mockRejectedValue(new Error('Host unreachable'));
  const failed = await hostStatus();
  expect(failed.error).toBe('Host unreachable');
  expect(failed.data).toEqual(first.data);
  expect(failed.updatedAt).toBe(first.updatedAt);
});
it('queries one-hour node RRD data and caches it separately', async () => {
  upstream.pve.mockReset().mockResolvedValue([{ time: 1, cpu: 0.2, memused: 100, netin: 1024, netout: 2048 }]);
  await hostHistory(); await hostHistory();
  expect(upstream.pve).toHaveBeenCalledTimes(1);
  expect(upstream.pve).toHaveBeenCalledWith('/nodes/node/rrddata', 'GET', { timeframe: 'hour', cf: 'AVERAGE' });
});
