import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:3110', channel: 'chromium', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  projects: [{ name: 'admin', testMatch: /admin\.spec\.ts/ }, { name: 'claim', testMatch: /claim\.spec\.ts/ }, { name: 'session', testMatch: /session\.spec\.ts/ }, { name: 'setup', testMatch: /setup\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:3113' } }],
  webServer: [
    { command: 'node tests/browser-server.mjs', url: 'http://127.0.0.1:3110/api/setup/status', reuseExistingServer: false, timeout: 30000 },
    { command: 'node tests/browser-server.mjs setup 3113', url: 'http://127.0.0.1:3113/api/setup/status', reuseExistingServer: false, timeout: 30000 },
  ],
});
