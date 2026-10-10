import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { closeDb, getDb } from '../server/lib/db';
import { publishedGuideViews, saveGuide } from '../server/lib/guides';
import type { Resource } from '../shared/schema';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-guides-test-'));
const resource: Resource = {
  id: 'resource-a001', studentId: 'a001', vmid: 1001, profileId: 'small', networkId: 'private', ip: '172.30.0.10', state: 'ready', createdAt: 1,
  spec: { name: 'Small', published: true, enabled: true, template: 'local:vztmpl/debian.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 2, memory: 2048, swap: 0, disk: 16, networkId: 'private', nesting: false, initialForwards: [] },
  network: { name: 'Private', mode: 'nat', bridge: 'dc0', cidr: '172.30.0.0/24', gateway: '172.30.0.1', start: '172.30.0.10', end: '172.30.0.200', dns: ['1.1.1.1'], excluded: [], vlan: null },
};

beforeAll(() => { process.env.PDC_DATA_DIR = directory; });
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-guides-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('renders published guides with machine and forward placeholders and sanitizes HTML', async () => {
  getDb().prepare('INSERT INTO networks(id,spec,ready) VALUES(?,?,1)').run('private', JSON.stringify(resource.network));
  getDb().prepare('INSERT INTO profiles(id,spec,network_id) VALUES(?,?,?)').run('small', JSON.stringify(resource.spec), 'private');
  getDb().prepare('INSERT INTO students(id,name,created_at) VALUES(?,?,?)').run('a001', '测试同学', 1);
  getDb().prepare('INSERT INTO resources(id,student_id,vmid,profile_id,network_id,ip,spec,network,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(resource.id, resource.studentId, resource.vmid, resource.profileId, resource.networkId, resource.ip, JSON.stringify(resource.spec), JSON.stringify(resource.network), resource.state, resource.createdAt);
  getDb().prepare('INSERT INTO forwards(id,student_id,resource_id,protocol,public_port,target_port,note,state) VALUES(?,?,?,?,?,?,?,?)')
    .run('forward-a001', 'a001', resource.id, 'tcp', 11002, 22, '', 'ready');
  saveGuide({ title: '使用指南', markdown: '# {{machine.studentId}}\n{{machine.ip}} {{machine.cores}}\n{{forward:22}}\n{{forward:80}}\n<script>alert(1)</script>', published: true, defaultCollapsed: false, sortOrder: 1 });
  saveGuide({ title: '草稿', markdown: 'draft', published: false, sortOrder: 2 });
  const views = await publishedGuideViews(resource, [{ id: 'forward-a001', studentId: 'a001', resourceId: resource.id, protocol: 'tcp', publicPort: 11002, targetPort: 22, note: '', enabled: true, state: 'ready', error: null }], 'relay.example');
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({ title: '使用指南', defaultCollapsed: false });
  expect(views[0].html).toContain('a001');
  expect(views[0].html).toContain('relay.example:11002');
  expect(views[0].html).toContain('该 80 端口未转发');
  expect(views[0].html).not.toContain('<script>');
});
