// Fixture-only browser test. NODE_PATH must include Playwright.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/catalog') return route.fulfill({ json: { products: [
        { id: 1, name: 'Gói AI', category: 'AI', description: 'Thông tin sản phẩm', selling_price: 20000, in_stock: true },
        { id: 2, name: 'Gói khác', category: 'Khác', description: '', selling_price: 50000, in_stock: true },
      ], categories: ['AI', 'Khác'] } });
      return route.fulfill({ status: 401, json: { error: 'Đăng nhập' } });
    });
    await page.goto('http://127.0.0.1:4175/');
    await page.getByRole('searchbox').fill('Gói AI');
    await page.getByRole('button', { name: 'Xem chi tiết Gói AI' }).click();
    await page.getByRole('heading', { name: 'Gói AI', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Product detail is a page, not a modal');
    await page.getByRole('button', { name: 'Trở lại danh sách' }).click();
    assert.equal(await page.getByRole('searchbox').inputValue(), 'Gói AI', 'Search remains when returning');
    assert.equal(await page.locator('.product-card').count(), 1);
    console.log('PASS: product detail uses a page and preserves catalog search.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
