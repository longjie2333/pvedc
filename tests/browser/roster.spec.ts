import { test, expect } from '@playwright/test';

const student = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  className: '一班',
  profileId: null,
  enabled: true,
  claimKey: '',
  claimed: true,
  deleting: false,
  createdAt: 1,
  resource: null,
  ...extra,
});

test('roster row menu resets a claim and batch delete requires the typed phrase', async ({ page }) => {
  const posts: { path: string; body: unknown }[] = [];
  await page.route('**/api/auth/session', route =>
    route.fulfill({
      json: {
        actor: { role: 'admin', sub: 'admin', sessionId: 'roster' },
        initialized: true,
        title: '名单测试',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    }),
  );
  await page.route('**/api/admin/**', route => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === 'POST') posts.push({ path, body: request.postDataJSON() });
    if (path.endsWith('/overview'))
      return route.fulfill({
        json: {
          students: [student('a00101', '甲同学'), student('a00102', '乙同学', { claimed: false })],
          resources: [],
          profiles: [],
          networks: [],
          forwards: [],
          taskCounts: { attention: 0 },
        },
      });
    if (path.endsWith('/students/batch'))
      return route.fulfill({
        json: {
          batchId: 'b1',
          action: 'delete',
          items: [{ studentId: 'a00102', status: 'skipped', message: '无机器' }],
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin/students');

  await page.getByRole('button', { name: '操作 甲同学', exact: true }).click();
  await page.getByRole('menuitem', { name: '重置认领', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: '重置学生认领' })).toBeVisible();
  await page.getByRole('button', { name: '确认重置', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: '重置学生认领' })).toHaveCount(0);
  expect(posts.map(post => post.path)).toContain('/api/admin/students/a00101/reset');

  // An unclaimed student offers no reset; its row delete targets only that student.
  await page.getByRole('button', { name: '操作 乙同学', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '重置认领', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirm = page.getByRole('button', { name: '确认删除学生', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('请输入“删除 1 名学生”').fill('删除 1 名学生');
  await confirm.click();
  await expect(page.getByRole('heading', { name: '批量操作受理结果' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /已跳过/ })).toContainText('无机器');
  expect(posts.find(post => post.path.endsWith('/students/batch'))?.body).toEqual({
    action: 'delete',
    ids: ['a00102'],
    confirmation: '删除 1 名学生',
  });
});
