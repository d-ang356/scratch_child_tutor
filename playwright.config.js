// Playwright config for scratch_helper functional tests.
//
// Two test groups, selected by tag in the test title:
//   @mock  — intercept /api/chat at the browser boundary (page.route) so the
//            server's classifier + Ollama call never run. Deterministic, free,
//            no secret needed. The health check still hits the real /api/health,
//            which is green in cloud mode whenever an API key (even a dummy) is
//            set, so "Ollama is connected" is still verified.
//   @real  — no interception. The full server -> Ollama path runs, so these need
//            a real OLLAMA_API_KEY (and a real SCRATCH_MODEL). Used for the
//            safety-gate scenarios: Scratch questions get an answer + blocks,
//            off-topic questions get neither.
//
// No-docker local run: `npm test` — Playwright's webServer launches the app
//   itself (reuseExistingServer, so if you already run `npm start` it reuses it).
// Docker run: `npm run test:docker` — the app runs in its own container and the
//   tests run in the official Playwright container; set BASE_URL=http://app:8787
//   so webServer reuses the app container instead of launching one.

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const DB_PATH = process.env.SCRATCH_DB_PATH || 'test-data/scratch_helper.test.db';

module.exports = defineConfig({
  testDir: './tests',
  // Seed the shared SQLite DB once before tests (instead of each spec clearing
  // it in beforeAll, which would wipe rows out from under other specs). See
  // tests/support/globalSetup.js.
  globalSetup: require.resolve('./tests/support/globalSetup'),
  // workers MUST be 1. The suite shares a single app instance + a single SQLite
  // DB file + a single preferences.json. It is NOT parallel-safe at workers>1:
  // initial.spec.js forces the first-run prefs modal by deleting
  // preferences.json, and another spec saving prefs concurrently recreates the
  // file before initial's page reads /api/preferences, so the modal never opens
  // (reproduced ~1/8 at workers=2). Serial execution is race-free. To raise
  // workers, first decouple initial.spec from the shared preferences.json.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    // JUnit XML for the GitHub Actions pass/fail summary (dorny/test-reporter).
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  outputDir: 'test-results/output',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node --no-warnings server.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      SCRATCH_NO_OPEN: '1',
      HOST: process.env.HOST || '127.0.0.1',
      PORT: process.env.PORT || '8787',
      OLLAMA_BASE: process.env.OLLAMA_BASE || 'https://ollama.com',
      // Dummy key by default -> cloud health reports ok=true, so @mock tests
      // pass without a secret. @real tests set a real key via the environment.
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || 'mock-dummy-key',
      SCRATCH_MODEL: process.env.SCRATCH_MODEL || 'glm-5.2',
      SCRATCH_DB_PATH: DB_PATH,
    },
  },
});