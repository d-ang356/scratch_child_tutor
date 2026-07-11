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
//   itself with the throwaway test-data env and tears it down after
//   (reuseExistingServer is OFF locally, see IS_DOCKER below). It does NOT reuse
//   your own `node server.js` / `start.bat` on 8787 — that would skip the
//   test-data env and let the specs clobber your real preferences.json /
//   scratch_helper.db over HTTP. If 8787 is already taken, the launch now fails
//   loudly instead of silently reusing the wrong server.
// Docker run: `npm run test:docker` — the app runs in its own container and the
//   tests run in the official Playwright container; set BASE_URL=http://scratch-app:8787
//   so webServer reuses the app container instead of launching one. (The compose
//   service is named scratch-app, not app, so Chromium doesn't HSTS-upgrade the
//   bare `app` hostname to HTTPS — the app is plain HTTP.)

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
const DB_PATH = process.env.SCRATCH_DB_PATH || 'test-data/scratch_helper.test.db';
// Throwaway local prefs path (see tests/support/env.js prefsPath()). Passed to
// the webServer-launched app so it reads/writes the same file the specs delete.
// In Docker this is ignored — the app container is reused (reuseExistingServer)
// and already has SCRATCH_PREFS_PATH=/data/preferences.json from compose.
const PREFS_PATH = process.env.SCRATCH_PREFS_PATH || 'test-data/preferences.json';

// Reuse an existing server ONLY in Docker/CI, where the app runs in its own
// container (started by compose) and the webServer must not launch a second
// one. Locally we do NOT reuse: Playwright must launch the app itself with the
// throwaway test-data env (above) and tear it down after. Two reasons:
//   1. If your real app is already running on 8787 (start.bat / node server.js),
//      reuse would skip the test env and the specs would read/write YOUR real
//      preferences.json + scratch_helper.db over HTTP — silently clobbering them.
//   2. On Windows, a reused server is not always killed when tests finish, so a
//      leftover test server stays bound to 8787 and the next time you open the
//      app you hit the throwaway test-data files (looks like your data vanished;
//      it didn't — the real files are untouched on disk).
// With reuse off, a stale server on 8787 makes the launch fail loudly (port in
// use) instead of silently reusing the wrong server — kill it and re-run.
const IS_DOCKER = !!process.env.BASE_URL && process.env.BASE_URL !== 'http://127.0.0.1:8787';

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
  // @mock is deterministic (route-intercepted, no network) — retrying it would
  // only MASK flakiness, so it runs with retries: 0 and a real flake surfaces as
  // a failure. @real hits the cloud and can flake on latency, so it keeps 1 CI
  // retry. The CI workflow sets PLAYWRIGHT_ARGS="--grep @mock"/"--grep @real" per
  // shard; we read it here to pick the retry count. (Locally neither is set, so
  // both run with retries: 0 — a local @real flake is the dev's to see, not hide.)
  retries: process.env.CI && /@real/.test(process.env.PLAYWRIGHT_ARGS || '') ? 1 : 0,
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
    reuseExistingServer: IS_DOCKER,
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
      SCRATCH_PREFS_PATH: PREFS_PATH,
    },
  },
});