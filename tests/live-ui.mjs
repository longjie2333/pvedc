// Opt-in visual verification against the isolated PVE integration service.
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const credentials = JSON.parse(readFileSync('.data/ui-fixture.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3112');
  await page.getByLabel('学号', { exact: true }).fill(credentials.studentId);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /欢迎回来/ })).toBeVisible();
  await expect(page.getByText('CPU 使用率', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '系统监听端口' })).toBeVisible();
  await expect(page.getByRole('table').first().getByText('22', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('NaN');
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/student-live.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/student-live-mobile.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Live student dashboard verified against real PVE metrics and listening ports.');
} finally { await browser.close(); }
