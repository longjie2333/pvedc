// Opt-in visual verification against the isolated PVE integration service.
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { generateSync } from 'otplib';

const credentials = JSON.parse(readFileSync('.data/ui-fixture.json', 'utf8'));
const tunnel = spawn('ssh', ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', '127.0.0.1:3112:127.0.0.1:3111', 'pve'], { windowsHide: true, stdio: 'ignore' });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:3112/api/setup/status')).ok; } catch { return false; } }).toBe(true);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3112');
  await page.getByLabel('学号', { exact: true }).fill(credentials.studentId);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /欢迎回来/ })).toBeVisible();
  await expect(page.getByText('CPU 使用率', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '系统监听端口' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('NaN');
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/student-live.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '添加转发', exact: true }).click();
  await page.getByRole('combobox', { name: '容器端口', exact: true }).click();
  await expect(page.getByRole('option', { name: /22.*sshd/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /9000.*python/ })).toContainText('UDP · 0.0.0.0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/student-live-mobile.png', fullPage: true });
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  admin.on('pageerror', error => errors.push(error.message));
  await admin.goto('http://127.0.0.1:3112');
  await admin.getByRole('button', { name: '管理员入口' }).click();
  await admin.getByRole('textbox', { name: '动态验证码', exact: true }).fill(generateSync({ secret: credentials.adminSecret }));
  await expect(admin.getByRole('heading', { name: '宿主机总体状况' })).toBeVisible();
  await expect(admin.getByText('宿主网络 · KiB/s', { exact: true })).toBeVisible();
  await admin.screenshot({ path: 'test-results/admin-live.png', fullPage: true });
  await admin.getByRole('button', { name: '查看', exact: true }).first().click();
  await expect(admin.getByRole('heading', { name: '系统监听端口' })).toBeVisible();
  await expect(admin.getByRole('cell', { name: /sshd · \d+/ }).first()).toBeVisible();
  await expect(admin.getByText(/users:\(|fd=/)).toHaveCount(0);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Live admin/student dashboards, OTP login, host metrics and mobile port picker verified.');
} finally { await browser.close(); tunnel.kill(); }
