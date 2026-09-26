import { defineConfig } from '@playwright/test';

const baseURL = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:3000';
const port = new URL(baseURL).port || '3000';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  outputDir: '/tmp/languagerecap-ui-test-results',
  reporter: 'line',
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
