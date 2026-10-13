import { test, expect, type Page } from '@playwright/test';

const network = (id: string, name: string) => ({ id, name, mode: 'nat', bridge: 'dc' + id, cidr: '172.20.0.0/24', gateway: '172.20.0.1', start: '172.20.0.10', end: '172.20.0.200', dns: ['1.1.1.1'], excluded: [], vlan: null, ready: true, error: null });
const resources = [
  {
    id: 'resource-test', studentId: 'a00123', vmid: 1001, profileId: 'profile', state: 'ready', createdAt: 1,
    spec: { name: '测试配置', published: true, enabled: true, template: 'local:vztmpl/debian.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 2, memory: 1024, swap: 0, disk: 8, networkIds: ['network-1'], nesting: false, initialForwards: [] },
    networks: [
      { iface: 'eth0', networkId: 'network-1', name: '测试网络一', bridge: 'dc1', cidr: '172.20.0.0/24', ip: '172.20.0.10', gateway: '172.20.0.1', dns: ['1.1.1.1'], vlan: null, mac: 'AA:BB:CC:DD:EE:01' },
      { iface: 'eth1', networkId: 'network-2', name: '测试网络二', bridge: 'dc2', cidr: '172.25.0.0/24', ip: '172.25.0.10', gateway: null, dns: [], vlan: null, mac: 'AA:BB:CC:DD:EE:02' },
    ],
  },
];

async function mockWorkspace(page: Page, status: string) {
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown;
    if (path === '/api/auth/session') json = { actor: { role: 'admin', sub: 'admin', sessionId: 'test' }, initialized: true, title: '调整测试', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    else if (path === '/api/admin/overview') json = { students: [], resources, networks: [network('network-1', '测试网络一'), network('network-2', '测试网络二'), network('network-3', '测试网络三')], profiles: [], taskCounts: { attention: 0 }, forwards: [] };
    else if (path === '/api/admin/settings') json = { registrationOpen: true };
    else if (path === '/api/admin/options/networks') json = [{ iface: 'vmbr0', type: 'bridge', address: '10.1.229.140', vlanAware: false }, { iface: 'vmbr1', type: 'bridge', vlanAware: true }];
    else if (path === '/api/admin/resources/resource-test/adjust' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      submissions.push(body);
      json = { taskId: 'task-adjust-1' };
    } else if (path.startsWith('/api/admin/host/')) json = { data: null, error: null, updatedAt: Date.now() };
    else if (path === '/api/admin/resources/resource-test/status') json = { data: { status }, updatedAt: Date.now(), error: null };
    else if (path.endsWith('/ports') || path.endsWith('/history')) json = { data: [], updatedAt: Date.now(), error: null };
    else if (path === '/api/admin/tasks/task-adjust-1') json = { id: 'task-adjust-1', type: 'adjust', state: 'queued', step: 'pending', error: null, createdAt: 1, updatedAt: 1 };
    else json = { data: null, error: null, updatedAt: Date.now() };
    return route.fulfill({ json });
  });
  return submissions;
}

async function openAdjust(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '查看' }).click();
  await page.getByRole('button', { name: '调整配置' }).click();
  await expect(page.getByRole('dialog', { name: '调整机器配置' })).toBeVisible();
}

test('spec-only adjustments submit without a shutdown confirmation', async ({ page }) => {
  const submissions = await mockWorkspace(page, 'running');
  await openAdjust(page);
  const cores = page.getByRole('combobox', { name: 'CPU 核数', exact: true });
  await cores.fill('4'); await cores.press('Tab');
  await page.getByRole('button', { name: '保存并应用' }).click();
  await expect(page.getByRole('dialog', { name: '调整机器配置' })).toHaveCount(0);
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ confirmShutdown: false, spec: { cores: 4, memory: 1024, swap: 0, disk: 8 } });
  expect((submissions[0].networks as Record<string, unknown>[]).map(row => row.iface)).toEqual(['eth0', 'eth1']);
});

test('network changes on a running machine require the shutdown confirmation', async ({ page }) => {
  const submissions = await mockWorkspace(page, 'running');
  await openAdjust(page);
  const picker = page.getByRole('combobox', { name: '网络配置', exact: true }).nth(1);
  await picker.click();
  await page.getByRole('option', { name: /测试网络三/ }).click();
  await page.getByRole('button', { name: '保存并应用' }).click();
  const confirm = page.getByRole('alertdialog', { name: '调整网络需要先关机' });
  await expect(confirm).toBeVisible();
  expect(submissions).toHaveLength(0);
  await page.getByRole('button', { name: '关机并应用调整' }).click();
  await expect(confirm).toHaveCount(0);
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ confirmShutdown: true });
  const networks = submissions[0].networks as Record<string, unknown>[];
  expect(networks[1]).toMatchObject({ iface: 'eth1', networkId: 'network-3', macMode: 'keep' });
});

test('a stopped machine skips the shutdown confirmation but still blocks invalid custom input', async ({ page }) => {
  const submissions = await mockWorkspace(page, 'stopped');
  await openAdjust(page);
  const method = page.getByRole('combobox', { name: '配置模式', exact: true }).first();
  await method.click();
  await page.getByRole('option', { name: '自定义配置' }).click();
  await expect(page.getByText(/请选择可用网桥/)).toBeVisible();
  await expect(page.getByRole('button', { name: '保存并应用' })).toBeDisabled();
  expect(submissions).toHaveLength(0);
  const bridge = page.getByRole('combobox', { name: '网桥 / VNet', exact: true });
  await bridge.click();
  await page.getByRole('option', { name: /vmbr1/ }).click();
  await page.getByLabel('子网 CIDR').fill('192.168.60.0/24');
  await page.getByLabel('IP 地址').fill('192.168.60.20');
  await page.getByLabel('网关', { exact: true }).fill('192.168.60.1');
  const mac = page.getByRole('combobox', { name: 'MAC 地址', exact: true }).first();
  await mac.click();
  await page.getByRole('option', { name: '指定新 MAC' }).click();
  await page.getByLabel('新 MAC 地址').fill('AA:BB:CC:11:22:33');
  await expect(page.getByRole('button', { name: '保存并应用' })).toBeEnabled();
  await page.getByRole('button', { name: '保存并应用' }).click();
  await expect(page.getByRole('dialog', { name: '调整机器配置' })).toHaveCount(0);
  expect(submissions[0]).toMatchObject({ confirmShutdown: false });
  expect((submissions[0].networks as Record<string, unknown>[])[0]).toMatchObject({ iface: 'eth0', networkId: null, bridge: 'vmbr1', ip: '192.168.60.20', macMode: 'set', mac: 'AA:BB:CC:11:22:33' });
});
