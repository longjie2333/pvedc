import { test, expect } from '@playwright/test';
import { generateSync } from 'otplib';

test('first visit automatically creates and displays the TOTP key and QR code', async ({ page }) => {
  const response = page.waitForResponse(r => r.url().endsWith('/api/setup/begin') && r.request().method() === 'POST');
  await page.goto('/');
  const setup = await (await response).json();
  await expect(page.getByRole('heading', { name: '设置管理员身份' })).toBeVisible();
  await expect(page.getByAltText('管理员 TOTP 绑定二维码')).toBeVisible();
  await expect(page.getByText(setup.secret, { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '我已安全保存验证密钥' }).check();
  await page.getByLabel('动态验证码').fill(generateSync({ secret: setup.secret }));
  await page.getByRole('button', { name: '完成绑定，进入管理后台' }).click();
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '计算资源总览' })).toBeVisible();
  await expect(page.getByAltText('管理员 TOTP 绑定二维码')).toHaveCount(0);
});
