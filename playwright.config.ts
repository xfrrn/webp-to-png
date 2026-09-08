import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }], ['json', { outputFile: 'output/playwright/results.json' }]],
  outputDir: 'output/playwright/results',
  use: { baseURL: 'http://127.0.0.1:8787', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  // Always test real dist assets through Cloudflare's local runtime, never the dev server.
  webServer: { command: 'pnpm preview:cloudflare', url: 'http://127.0.0.1:8787', reuseExistingServer: false, timeout: 120_000, env: { WRANGLER_SEND_METRICS: 'false', CI: 'true' } },
});
