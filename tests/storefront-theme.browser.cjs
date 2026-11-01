// Fixture-only browser test. NODE_PATH must include Playwright.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 900 } });
    await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/catalog') return route.fulfill({ json: { products: [], categories: [] } });
      if (path === '/api/public/config') return route.fulfill({ json: {} });
      return route.fulfill({ status: 401, json: { error: 'Đăng nhập' } });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4175/');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false, 'Light is the default even if the OS is dark');
    await page.getByRole('button', { name: 'Chuyển giao diện tối' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
    await page.goto('http://127.0.0.1:4175/account');
    await page.getByRole('button', { name: 'Chuyển giao diện sáng' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'Preference persists on account pages');
    await page.getByRole('button', { name: 'Chuyển giao diện sáng' }).click();
    await page.goto('http://127.0.0.1:4175/pages/lien-he');
    await page.getByRole('button', { name: 'Chuyển giao diện tối' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
    await context.close();
    console.log('PASS: light default and theme preference across storefront, account and content.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
