import { BeforeAll, AfterAll, Before, After, ITestCaseHookParameter, setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(20000);
import { chromium, request, devices } from '@playwright/test';
import { spawn } from 'child_process';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { SelimSystemWorld } from './world';
import { cleanupAccount } from '../fixtures/apiHelpers';

let browser: Awaited<ReturnType<typeof chromium.launch>>;
let serverProcess: ReturnType<typeof spawn> | null = null;

const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3001}`;

async function isServerReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http
      .get(`${baseURL}/health`, (res) => {
        resolve(res.statusCode === 200);
      })
      .on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

BeforeAll({ timeout: 120000 }, async function () {
  if (!(await isServerReady())) {
    const port = process.env.E2E_PORT || '3001';
    const dataDir = process.env.DATA_DIR || path.join(os.tmpdir(), 'selimsystem-e2e-data');
    const projectRoot = path.resolve(__dirname, '..', '..');

    serverProcess = spawn('node', ['src/server.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_PORT: port,
        DATA_DIR: dataDir,
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });

    const startTime = Date.now();
    while (!(await isServerReady()) && Date.now() - startTime < 120000) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!(await isServerReady())) {
      throw new Error('El backend no inició dentro de 120 segundos');
    }
  }

  const headless = process.env.HEADLESS !== 'false';
  browser = await chromium.launch({ headless });
});

AfterAll(async function () {
  if (browser) await browser.close();
  if (serverProcess) {
    serverProcess.kill();
  }
});

Before(async function (this: SelimSystemWorld, scenario: ITestCaseHookParameter) {
  this.context = await browser.newContext({
    baseURL: this.baseURL,
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
  });
  // The app defaults to the desktop experience; existing scenarios were written for the mobile one,
  // so seed it unless the scenario explicitly checks the default (@default-experience).
  const checksDefaultExperience = scenario.pickle.tags.some((tag) => tag.name === '@default-experience');
  if (!checksDefaultExperience) {
    await this.context.addInitScript(() => {
      try {
        if (!localStorage.getItem('pate_experience')) localStorage.setItem('pate_experience', 'mobile');
      } catch {
        // Storage may be unavailable on about:blank.
      }
    });
  }
  this.page = await this.context.newPage();
  this.api = await request.newContext({ baseURL: this.baseURL });

  this.page.on('pageerror', (err) => {
    this.pageErrors.push(err.message);
  });

  this.page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // 401 al cargar /login es esperado para usuario no autenticado.
      if (text.includes('401 (Unauthorized)')) return;
      this.consoleErrors.push(text);
    }
  });
});

After({ timeout: 30000 }, async function (this: SelimSystemWorld, scenario: ITestCaseHookParameter) {
  if (this.user) {
    try {
      await cleanupAccount(this.api!, this.user);
    } catch {
      // Best-effort cleanup.
    }
  }

  if (scenario.result?.status === 'FAILED' && this.page) {
    try {
      const screenshot = await this.page.screenshot();
      this.attach(screenshot, 'image/png');
    } catch {
      // Ignorar errores de screenshot.
    }
  }

  if (this.page) await this.page.close({ runBeforeUnload: false });
  if (this.context) await this.context.close();
  if (this.api) await this.api.dispose();
});
