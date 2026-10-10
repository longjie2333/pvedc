import { test, expect } from '@playwright/test';

test('claim combobox searches remotely and only submits the selected roster identity', async ({ page }) => {
  const students = [
    { id: 'a00123', name: '张同学', className: '一班', assigned: true },
    { id: 'a00124', name: '李同学', className: '二班', assigned: false },
  ];
  const searches: string[] = [];
  await page.route('**/api/public/roster?*', route => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    searches.push(query);
    return route.fulfill({ json: { open: true, selfSelection: false, profiles: [], defaultProfileId: 'default',
      students: students.filter(student => (student.id + student.name).includes(query)) } });
  });
  await page.route('**/api/public/claim', route => route.fulfill({ status: 409, json: { error: '测试资源容量不足' } }));
  await page.goto('/');
  await page.getByRole('button', { name: '首次使用？认领资源' }).click();
  const picker = page.getByRole('combobox', { name: '我的学号' });
  await expect(page.getByText('查找学号或姓名', { exact: true })).toHaveCount(0);
  await picker.fill('张');
  await expect.poll(() => searches).toContain('张');
  await page.getByRole('option', { name: /a00123/ }).click();
  await expect(picker).toHaveValue('a00123 · 张同学');
  await expect(page.getByText('管理员已为你指定资源配置。')).toBeVisible();
  await page.getByLabel('设置密码').fill('Student-test-password');
  await picker.fill('不存在');
  await expect(page.getByText('没有匹配的未认领学生')).toBeVisible();
  await picker.press('Escape');
  await expect(page.getByRole('button', { name: '认领并创建资源' })).toBeDisabled();
  await picker.fill('a00124');
  await expect(page.getByRole('option', { name: /a00124/ })).toBeVisible();
  await picker.press('ArrowDown');
  await picker.press('Enter');
  const submission = page.waitForRequest(request => request.url().endsWith('/api/public/claim'));
  await page.getByRole('button', { name: '认领并创建资源' }).click();
  expect((await submission).postDataJSON().studentId).toBe('a00124');
  expect(searches).toContain('张');
  expect(searches).toContain('a00124');
  await expect(page.getByRole('alert')).toContainText('测试资源容量不足');
});
