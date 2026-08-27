/**
 * Electron smoke tests.
 *
 * Drives the REAL app (dist/main/index.js) against live network conditions,
 * covering the flows the 2026-08-26 review flagged as untested: navigation,
 * link failure surfaces, tab keyboard shortcuts, internal pages, and the
 * downloads surface. Run with: xvfb-run -a npm run test:e2e
 */
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await _electron.launch({
    args: [
      path.join(__dirname, '../../dist/main/index.js'),
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();
});

type Locator = ReturnType<Page['getByPlaceholder']>;

function addressBar(): Locator {
  return page.getByPlaceholder(/Search with .* or enter URL/);
}

async function navigateTo(url: string): Promise<void> {
  const bar = addressBar();
  await bar.click();
  await bar.fill(url);
  await bar.press('Enter');
}

async function expandSidebar(): Promise<void> {
  await page.locator('.select-none').first().hover();
  await page.waitForTimeout(400); // expand animation
}

async function tabCount(): Promise<number> {
  await expandSidebar();
  return page.getByTestId('tab-row').count();
}

test('app opens with the shell and one tab', async () => {
  await expect(addressBar()).toBeVisible();
  expect(await tabCount()).toBe(1);
});

test('navigates to a real https site and shows its title', async () => {
  await navigateTo('https://example.com');
  await expect(page.getByText('Example Domain').first()).toBeVisible({ timeout: 60_000 });
});

test('failed navigation shows the error surface with retry', async () => {
  await navigateTo('https://this-site-does-not-exist.invalid/');
  await expect(page.getByText('Page failed to load')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('Ctrl+T opens a new tab and Ctrl+W closes it', async () => {
  const before = await tabCount();
  await page.keyboard.press('Control+t');
  await expect(page.getByTestId('tab-row')).toHaveCount(before + 1);
  await page.keyboard.press('Control+w');
  await expect(page.getByTestId('tab-row')).toHaveCount(before);
});

test('address bar resolves a search query', async () => {
  await navigateTo('example.com');
  await expect(page.getByText('Example Domain').first()).toBeVisible({ timeout: 60_000 });
});

test('downloads page opens via Ctrl+J', async () => {
  await page.keyboard.press('Control+j');
  await expect(page.getByText('Downloads').first()).toBeVisible({ timeout: 15_000 });
});

test('webview survives switching between two tabs', async () => {
  await page.keyboard.press('Control+t');
  await navigateTo('https://example.com');
  await expect(page.getByText('Example Domain').first()).toBeVisible({ timeout: 60_000 });
  // Switch back to the previous tab and then return.
  const rows = page.getByTestId('tab-row');
  await rows.nth(0).click();
  await page.waitForTimeout(500);
  await rows.nth(1).click();
  await expect(page.getByText('Example Domain').first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Control+w');
});
