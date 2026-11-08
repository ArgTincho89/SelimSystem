import { Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(`/#${path}`);
  }

  async waitForUrlHash(path: string): Promise<void> {
    await this.page.waitForFunction(
      (expected) => window.location.hash === expected,
      `#${path}`,
      { timeout: 10000 }
    );
  }
}
