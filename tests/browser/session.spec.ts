import { test, expect } from '@playwright/test';

test('concurrent protected requests share one refresh and retry once', async ({ page }) => {
  let authorized = false, refreshes = 0;
  const actor = { role: 'admin', sub: 'admin', sessionId: 'browser-session' };
  const session = () => ({ actor, initialized: true, title: '续期测试', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  await page.route('**/api/auth/session', route => route.fulfill({ json: session() }));
  await page.route('**/api/auth/refresh', async route => {
    refreshes++;
    await new Promise(resolve => setTimeout(resolve, 150));
    authorized = true;
    await route.fulfill({ json: session() });
  });
  const attempts = new Map<string, number>();
  await page.route('**/api/admin/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    attempts.set(name, (attempts.get(name) || 0) + 1);
    if (!authorized) return route.fulfill({ status: 401, json: { error: '需要登录', code: 'AUTH_REQUIRED' } });
    const json = name === 'overview' ? { students: [], resources: [], taskCounts: { attention: 0 }, profiles: [], networks: [], forwards: [] }
      : name === 'settings' ? { registrationOpen: false } : [];
    return route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
  expect(refreshes).toBe(1);
  expect(attempts.get('overview')).toBe(2);
  expect(attempts.get('settings')).toBe(2);
});

test('an expired refresh returns to login and incorrect credentials never trigger refresh', async ({ page }) => {
  let expired = true, refreshes = 0;
  await page.route('**/api/auth/session', route => route.fulfill(expired
    ? { status: 401, json: { error: '需要刷新', code: 'AUTH_REQUIRED' } }
    : { json: { actor: null, initialized: true, title: '续期测试' } }));
  await page.route('**/api/auth/refresh', route => {
    refreshes++; expired = false;
    return route.fulfill({ status: 401, json: { error: '登录已失效', code: 'SESSION_EXPIRED' } });
  });
  await page.route('**/api/auth/student', route => route.fulfill({ status: 401, json: { error: '学号或密码不正确', code: 'REQUEST_FAILED' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '登录学生工作台' })).toBeVisible();
  expect(refreshes).toBe(1);
  await page.getByLabel('学号', { exact: true }).fill('a00123');
  await page.getByLabel('密码', { exact: true }).fill('Incorrect-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '操作失败' })).toContainText('学号或密码不正确');
  expect(refreshes).toBe(1);
});

test('refreshes proactively before the access deadline', async ({ page }) => {
  const epoch = Date.now();
  await page.clock.install({ time: new Date(epoch) });
  let refreshes = 0;
  const session = () => ({ actor: { role: 'admin', sub: 'admin', sessionId: 'timer-session' }, initialized: true, title: '续期测试',
    expiresAt: Math.floor(epoch / 1000) + (refreshes ? 3660 : 65) });
  await page.route('**/api/auth/session', route => route.fulfill({ json: session() }));
  await page.route('**/api/auth/refresh', route => { refreshes++; return route.fulfill({ json: session() }); });
  await page.route('**/api/admin/**', route => route.fulfill({ json: route.request().url().endsWith('/overview')
    ? { students: [], resources: [], taskCounts: { attention: 0 }, profiles: [], networks: [], forwards: [] } : {} }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
  expect(refreshes).toBe(0);
  await page.clock.fastForward(10_000);
  await expect.poll(() => refreshes).toBe(1);
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
});
