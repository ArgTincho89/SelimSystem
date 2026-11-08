import { World, setWorldConstructor, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, APIRequestContext, APIResponse } from '@playwright/test';
import { TestUser } from '../fixtures/userFactory';

export class SelimSystemWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  api?: APIRequestContext;
  baseURL: string;
  user?: TestUser;
  lastResponse?: APIResponse;
  lastResponseBody?: any;
  consoleErrors: string[] = [];
  pageErrors: string[] = [];
  createdCategories: Map<string, any> = new Map();
  createdTransactions: Map<string, any> = new Map();
  createdGoals: Map<string, any> = new Map();
  createdAccounts: Map<string, any> = new Map();
  accountTotalsBeforeTransfer?: any;
  lastTransaction?: any;

  constructor(options: IWorldOptions) {
    super(options);
    this.baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3001}`;
  }
}

setWorldConstructor(SelimSystemWorld);
