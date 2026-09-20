import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const installedChrome =
  process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app');

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 8000 },
  reporter: [['list']],
  use: {
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (installedChrome ? 'chrome' : undefined),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
});
