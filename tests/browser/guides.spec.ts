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

