import { defineConfig, devices } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html-report', open: 'never' }],
  ],
  outputDir: 'reports/test-results',
  use: {
    baseURL: 'http://localhost:3001',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node ../src/server.js',
    url: 'http://localhost:3001/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      E2E_PORT: '3001',
      DATA_DIR: path.join(os.tmpdir(), 'selimsystem-e2e-data'),
      NODE_ENV: 'test',
    },
  },
});
