import { defineConfig, devices } from '@playwright/test'

const fakeMedia = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
]

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'docs/playwright-report.json' }]],
  use: { baseURL: 'http://127.0.0.1:43123' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43123 --strictPort',
    url: 'http://127.0.0.1:43123',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1366, height: 768 }, launchOptions: { args: fakeMedia } },
    },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1366, height: 768 } } },
    {
      name: 'chromium-1920',
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 }, launchOptions: { args: fakeMedia } },
    },
    { name: 'webkit-1920', use: { browserName: 'webkit', viewport: { width: 1920, height: 1080 } } },
    {
      name: 'chromium-iphone',
      use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions: { args: fakeMedia } },
    },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    {
      name: 'chromium-android',
      use: { ...devices['Pixel 7'], browserName: 'chromium', launchOptions: { args: fakeMedia } },
    },
    {
      name: 'webkit-android',
      use: { browserName: 'webkit', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    },
  ],
})