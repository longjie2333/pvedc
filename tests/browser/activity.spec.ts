import { test, expect } from '@playwright/test';

test('activity tabs fetch only the active page and preserve independent query state', async ({ page }) => {
  await page.clock.install();
  const calls: string[] = [];
  await page.route('**/api/auth/session', route => route.fulfill({ json: { actor: { role: 'admin', sub: 'admin', sessionId: 'test' }, initialized: true, title: '分页测试', expiresAt: Math.floor(Date.now() / 1000) + 3600 } }));
  await page.route('**/api/admin/**', route => {
    const url = new URL(route.request().url()), action = url.pathname.split('/').pop();
    if (action === 'overview') return route.fulfill({ json: { students: [], resources: [], taskCounts: { attention: 0 }, profiles: [], networks: [], forwards: [] } });
    if (action === 'settings') return route.fulfill({ json: { registrationOpen: false } });
    if (action === 'actions') return route.fulfill({ json: [{ action: 'resource.start' }] });
    if (!['tasks', 'audit'].includes(action || '')) return route.fulfill({ json: [] });
    calls.push(action + url.search);
    const current = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('pageSize'));
    const total = url.searchParams.get('q') ? 1 : 55;
    const items = Array.from({ length: Math.max(0, Math.min(size, total - (current - 1) * size)) }, (_, offset) => {
      const index = (current - 1) * size + offset + 1;
      return action === 'tasks' ? { id: String(index), type: 'start', studentId: 'a' + String(index).padStart(5, '0'), state: 'succeeded', step: 'complete', createdAt: 100, updatedAt: 100 }
        : { id: index, actor: 'admin', action: 'resource.start', target: '审计目标-' + index, created_at: 100 };
    });
    return route.fulfill({ json: { items, total, page: current, pageSize: size } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
  expect(calls).toEqual([]);
  await page.getByRole('link', { name: '任务与审计', exact: true }).click();
  const tasks = page.getByRole('tabpanel', { name: '任务记录', exact: true });
  await expect(tasks.locator('tbody tr')).toHaveCount(20);
  expect(calls.some(call => call.startsWith('audit'))).toBe(false);
  await tasks.getByRole('button', { name: '下一页' }).click();
  await expect(tasks.getByText('a00021', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '操作审计', exact: true }).click();
  const audit = page.getByRole('tabpanel', { name: '操作审计', exact: true });
  await expect(audit.locator('tbody tr')).toHaveCount(20);
  const count = calls.filter(call => call.startsWith('tasks')).length;
  await page.clock.fastForward(6000);
  expect(calls.filter(call => call.startsWith('tasks')).length).toBe(count);
  await audit.getByLabel('关键词').fill('查询目标');
  await audit.getByRole('button', { name: '查询', exact: true }).click();
  await expect(audit.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('tab', { name: '任务记录', exact: true }).click();
  await expect(tasks.getByText('a00021', { exact: true })).toBeVisible();
  await tasks.getByRole('combobox', { name: '每页条数' }).click();
  await page.getByRole('option', { name: '50', exact: true }).click();
  await expect(tasks.locator('tbody tr')).toHaveCount(50);
  expect(calls.some(call => call.includes('page=1&pageSize=50'))).toBe(true);
});
