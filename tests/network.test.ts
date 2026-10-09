import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

vi.mock('../server/lib/helper', () => ({ helper: vi.fn() }));
vi.mock('../server/lib/pve', async original => ({ ...await original<typeof import('../server/lib/pve')>(), pve: vi.fn() }));
vi.mock('../server/lib/inventory', () => ({ inventory: async () => ({ configs: [] }) }));
import { helper } from '../server/lib/helper';
import { pve } from '../server/lib/pve';
import { applyNetwork } from '../server/lib/network';
import { closeDb, getDb } from '../server/lib/db';
import { cancelNetworkTask } from '../server/lib/task-recovery';
import { saveNetwork } from '../server/lib/catalog';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-network-test-'));
const spec = { name: 'Test', mode: 'nat', bridge: 'dclock', cidr: '172.28.0.0/24', gateway: '172.28.0.1', start: '172.28.0.10', end: '172.28.0.20', dns: ['1.1.1.1'], excluded: [], vlan: null };
let failSubnet = false;
beforeAll(() => { process.env.PDC_DATA_DIR = directory; });
beforeEach(() => {
  vi.clearAllMocks(); failSubnet = false;
  getDb().prepare('DELETE FROM jobs').run(); getDb().prepare('DELETE FROM networks').run();
  getDb().prepare('INSERT INTO networks(id,spec) VALUES(?,?)').run('network', JSON.stringify(spec));
  getDb().prepare('INSERT INTO jobs(id,type,state,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('job', 'network-apply', 'queued', JSON.stringify({ networkId: 'network' }), 1, 1);
  vi.mocked(helper).mockResolvedValue({ locked: false, owned: false });
  vi.mocked(pve).mockImplementation(async (path, method = 'GET') => {
    if (path.endsWith('/network')) return [{ iface: 'vmbr0', type: 'bridge', cidr: '10.1.229.140/24' }];
    if (path === '/cluster/sdn/lock') return 'new-lock';
    if (path === '/cluster/sdn' && method === 'PUT') return 'UPID:test';
    if (path.endsWith('/subnets') && method === 'POST' && failSubnet) throw new Error('Injected failure');
    return method === 'GET' ? [] : null;
  });
});
afterAll(() => { closeDb(); delete process.env.PDC_DATA_DIR; if (!directory.startsWith(resolve(tmpdir(), 'pvedc-network-test-'))) throw new Error('Unsafe cleanup'); rmSync(directory, { recursive: true, force: true }); });
it('persists the lock token and explicitly releases it when committing', async () => {
  expect(await applyNetwork('network', 'job')).toBe('UPID:test');
  expect(pve).toHaveBeenCalledWith('/cluster/sdn', 'PUT', { 'lock-token': 'new-lock', 'release-lock': 1 });
  expect(JSON.parse((getDb().prepare('SELECT payload FROM jobs').get() as { payload: string }).payload).sdnLock).toBe('new-lock');
});
it('never mutates SDN while somebody else owns the global lock', async () => {
  vi.mocked(helper).mockResolvedValue({ locked: true, owned: false });
  await expect(applyNetwork('network', 'job')).rejects.toThrow('其他操作');
  expect(vi.mocked(pve).mock.calls.filter(call => call[1] && call[1] !== 'GET')).toHaveLength(0);
});
it('rolls back its own interrupted transaction before reacquiring a fresh lock', async () => {
  getDb().prepare('UPDATE jobs SET payload=?').run(JSON.stringify({ networkId: 'network', sdnLock: 'previous-lock' }));
  vi.mocked(helper).mockResolvedValue({ locked: true, owned: true });
  await applyNetwork('network', 'job');
  expect(pve).toHaveBeenCalledWith('/cluster/sdn/rollback', 'POST', { 'lock-token': 'previous-lock', 'release-lock': 1 });
});
it('rolls back partial writes on failure and clears the recovered token', async () => {
  failSubnet = true;
  vi.mocked(helper).mockResolvedValueOnce({ locked: false, owned: false }).mockResolvedValue({ locked: true, owned: true });
  await expect(applyNetwork('network', 'job')).rejects.toThrow('Injected failure');
  expect(pve).toHaveBeenCalledWith('/cluster/sdn/rollback', 'POST', { 'lock-token': 'new-lock', 'release-lock': 1 });
  expect(JSON.parse((getDb().prepare('SELECT payload FROM jobs').get() as { payload: string }).payload).sdnLock).toBeUndefined();
});
it('does not roll back a replacement lock owned by another operator', async () => {
  failSubnet = true;
  vi.mocked(helper).mockResolvedValueOnce({ locked: false, owned: false }).mockResolvedValue({ locked: true, owned: false });
  await expect(applyNetwork('network', 'job')).rejects.toThrow('Injected failure');
  expect(vi.mocked(pve).mock.calls.some(call => call[0] === '/cluster/sdn/rollback')).toBe(false);
});
it('allows canceling an untouched queued task so its configuration can be corrected', () => {
  cancelNetworkTask({ role: 'admin', sub: 'admin', sessionId: 'test' }, 'job');
  expect(() => saveNetwork({ ...spec, name: 'Corrected' }, 'network')).not.toThrow();
  expect((getDb().prepare('SELECT state FROM jobs').get() as { state: string }).state).toBe('failed');
});
it('refuses to cancel a transaction with an unresolved lock token', () => {
  getDb().prepare("UPDATE jobs SET state='attention',payload=?").run(JSON.stringify({ networkId: 'network', sdnLock: 'unresolved' }));
  expect(() => cancelNetworkTask({ role: 'admin', sub: 'admin', sessionId: 'test' }, 'job')).toThrow('核对');
  expect((getDb().prepare('SELECT state FROM jobs').get() as { state: string }).state).toBe('attention');
});
