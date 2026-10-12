import { test, expect } from '@playwright/test';
import { generateSync } from 'otplib';

test('administrator can create and publish a Milkdown guide', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '管理员入口' }).click();
  await page.getByRole('textbox', { name: '动态验证码', exact: true }).fill(generateSync({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }));
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
  await page.getByRole('link', { name: '指导书', exact: true }).click();
  await expect(page.locator('h1').filter({ hasText: /^指导书$/ })).toBeVisible();
  await page.getByRole('button', { name: '新建指导书' }).click();
  await page.getByLabel('指导书标题', { exact: true }).fill('浏览器验收指南');
  const source = page.locator('span.guide-source textarea');
  await expect(source).toBeVisible();
  await source.fill('# 浏览器验收指南\n\n{{machine.ip}}\n\n{{forward:22}}');
  await page.getByRole('switch', { name: '公布' }).check();
  await page.getByRole('button', { name: '打开实时编辑器' }).click();
  await expect(page.locator('.milkdown .editor')).toContainText('浏览器验收指南');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: /浏览器验收指南/ })).toBeVisible();
  await expect(page.getByText('浏览器验收指南', { exact: true })).toHaveCount(2);
});


test('student sees published guides as collapsible rendered content', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { actor: { role: 'student', sub: 'a00123', sessionId: 'student-test' }, initialized: true, title: '指南测试' } });
    if (path === '/api/me/overview') return route.fulfill({ json: { student: { id: 'a00123', name: '测试同学', profileId: null }, resource: { id: 'resource-1', studentId: 'a00123', vmid: 1001, profileId: 'profile-1', state: 'ready', createdAt: 1, networks: [{ iface: 'eth0', networkId: 'network-1', name: '测试网络', bridge: 'vmbr0', cidr: '172.20.0.0/24', ip: '172.20.0.10', gateway: '172.20.0.1', dns: ['1.1.1.1'], vlan: null, mac: null }], spec: { name: '测试配置', published: true, enabled: true, template: 'local:vztmpl/debian.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 2, memory: 1024, swap: 0, disk: 8, networkIds: ['network-1'], nesting: false, initialForwards: [] } }, forwards: [], publicHost: 'relay.test', profiles: [], selfSelection: false } });
    if (path === '/api/me/status' || path === '/api/me/history') return route.fulfill({ json: { data: [], updatedAt: Date.now() } });
    if (path === '/api/me/guides') return route.fulfill({ json: { guides: [{ id: 'guide-1', title: '连接指南', html: '<p>内网地址：172.20.0.10</p><p>该 22 端口未转发</p>', defaultCollapsed: true, sortOrder: 1 }] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.locator('.machine-banner + .panel').getByRole('heading', { name: '使用指南', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: '连接指南', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByText('内网地址：172.20.0.10', { exact: true })).toBeVisible();
  await expect(page.getByText('该 22 端口未转发', { exact: true })).toBeVisible();
});
