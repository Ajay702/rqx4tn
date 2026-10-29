import { defineConfig } from '@playwright/test'

// Runs against Brave by default (any Chromium works: set BROWSER_PATH, or
// unset it to use Playwright's bundled Chromium).
const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8000',
    viewport: { width: 1360, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.BROWSER_PATH ?? brave },
  },
})
