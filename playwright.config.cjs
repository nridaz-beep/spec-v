const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  globalTeardown: './tests/teardown.cjs',
  forbidOnly: !!process.env.CI, timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', viewport: { width: 1280, height: 900 },
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  webServer: { command: 'node tests/server.cjs', url: 'http://127.0.0.1:4173/__test/state', reuseExistingServer: false, timeout: 30000 },
});
