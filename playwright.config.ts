import { defineConfig, devices } from '@playwright/test'

// By default the tests start their own API (port 8001, clinic_test database)
// and their own build of the frontend (port 5181), so they never touch development
// data. Set E2E_BASE_URL and E2E_API_URL to test an already-running stack
// instead, e.g. the docker compose one.
const usingExternalStack = Boolean(process.env.E2E_BASE_URL)
const webURL = process.env.E2E_BASE_URL ?? 'http://localhost:5181'
const apiURL = process.env.E2E_API_URL ?? 'http://localhost:8001'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Generous limits: the suite should pass on a busy laptop, not only a fast one.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The app turns its animations off for "reduce motion", so tests never
    // have to time themselves against a modal sliding in or out.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    // API tests talk straight to FastAPI through Playwright's request fixture.
    { name: 'api', testDir: 'e2e/api', use: { baseURL: apiURL } },
    // Desktop runs everything except the tests that only make sense on a phone.
    {
      name: 'desktop',
      testDir: 'e2e/ui',
      grepInvert: /@mobile-only/,
      use: { ...devices['Desktop Chrome'], baseURL: webURL },
    },
    // Mobile runs the tests tagged @mobile (also run on desktop) or @mobile-only.
    {
      name: 'mobile',
      testDir: 'e2e/ui',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'], baseURL: webURL },
    },
  ],
  webServer: usingExternalStack
    ? undefined
    : [
        {
          command: 'sh scripts/e2e-api.sh',
          url: `${apiURL}/health`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          // A production build, not the dev server: it is what ships, and it
          // starts fast enough that the first tests do not race a cold compile.
          command: 'npm --prefix frontend run e2e:serve',
          url: webURL,
          env: { VITE_API_PROXY_TARGET: apiURL },
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
})
