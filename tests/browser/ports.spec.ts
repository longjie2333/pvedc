import { test, expect, type Page } from '@playwright/test';

const resource = { id: 'resource-test', studentId: 'a00123', vmid: 1001, profileId: 'profile', networkId: 'network', ip: '172.20.0.10', state: 'ready',
  spec: { name: 'Test profile', distro: 'debian', cores: 2, memory: 1024, disk: 8 } };
const ports = [
  { protocol: 'tcp', address: '0.0.0.0', port: 8080, processes: [{ name: 'node', pid: 42 }] },
  { protocol: 'udp', address: '127.0.0.53', port: 53, processes: [{ name: 'systemd-resolve', pid: 10 }] },
  { protocol: 'udp', address: '0.0.0.0', port: 9000, processes: [{ name: 'udp-service', pid: 88 }] },
];
async function mockWorkspace(page: Page, role: 'student' | 'admin') {
  const submissions: Record<string, unknown>[] = [], rules: Record<string, unknown>[] = [];
  let portReads = 0;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown;
    if (path === '/api/auth/session') json = { actor: { role, sub: role === 'admin' ? 'admin' : resource.studentId, sessionId: 'test' }, initialized: true, title: '端口测试', expiresAt: Math.floor(Date.now()/1000) + 3600 };
    else if (path === '/api/me/overview') json = { student: { id: resource.studentId, name: '测试同学' }, resource, forwards: rules, profiles: [], publicHost: 'relay.test', selfSelection: false };
    else if (path === '/api/admin/overview') json = { students: [], resources: [resource], networks: [], profiles: [], taskCounts: { attention: 0 }, forwards: [] };
    else if (path === '/api/admin/settings') json = { registrationOpen: true };
    else if (path.endsWith('/ports')) { portReads++; json = { data: ports, updatedAt: Date.now(), error: null }; }
    else if (path === '/api/me/status' || path.endsWith('/resource-test/status')) json = { data: { status: 'running', cpu: 0.1, cpus: 2, mem: 1024, maxmem: 1e9, disk: 1024, maxdisk: 8e9, netin: 1024, netout: 1024, uptime: 100 }, updatedAt: Date.now() };
    else if (path.endsWith('/history')) json = { data: [], updatedAt: Date.now() };
    else if (path === '/api/me/forwards' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); submissions.push(body);
      rules.push({ ...body, id: 'forward-' + submissions.length, publicPort: 11000 + submissions.length, enabled: true, state: 'ready' });
      json = { id: 'forward-' + submissions.length };
    } else if (path === '/api/me/tasks') json = { items: [], total: 0, page: 1, pageSize: 20 };
    else json = { data: null, error: null, updatedAt: Date.now() };
    return route.fulfill({ json });
  });
  return { submissions, portReads: () => portReads };
}

test('student ports are fetched only in the forwarding dialog and object selection carries the protocol', async ({ page }) => {
  const workspace = await mockWorkspace(page, 'student');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '测试同学，欢迎回来' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '系统监听端口' })).toHaveCount(0);
  expect(workspace.portReads()).toBe(0);
  await page.getByRole('button', { name: '添加转发', exact: true }).click();
  const picker = page.getByRole('combobox', { name: '容器端口', exact: true });
  await picker.click();
  await expect(page.getByRole('option', { name: /53.*systemd-resolve/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('option', { name: /9000/ })).toContainText('UDP · 0.0.0.0 · udp-service');
  await page.getByRole('option', { name: /9000/ }).click();
  await expect(picker).toContainText('udp-service');
  await page.screenshot({ path: 'test-results/student-forward-dialog.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/student-forward-mobile.png' });
  await page.getByRole('button', { name: '创建转发', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '添加端口转发', exact: true })).toHaveCount(0);
  expect(workspace.submissions[0]).toMatchObject({ protocol: 'udp', targetPort: 9000 });
  await page.getByRole('button', { name: '添加转发', exact: true }).click();
  await picker.click();
  await page.getByRole('option', { name: /手动指定端口/ }).click();
  await page.getByLabel('自定义容器端口').fill('25565');
  await page.getByRole('button', { name: '创建转发', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '添加端口转发', exact: true })).toHaveCount(0);
  expect(workspace.submissions[1]).toMatchObject({ protocol: 'tcp', targetPort: 25565 });
});

test('administrator port table renders process names and PIDs', async ({ page }) => {
  await mockWorkspace(page, 'admin');
  await page.goto('/');
  await page.getByRole('button', { name: '查看' }).click();
  await expect(page.getByRole('heading', { name: '系统监听端口' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'node · 42', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'udp-service · 88', exact: true })).toBeVisible();
  await expect(page.getByText(/users:\(|fd=/)).toHaveCount(0);
});
