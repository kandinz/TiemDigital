const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const products = [{ provider_product_id: 'sku-1', name: 'Gói một', price_usd: 2, in_stock: true, category: 'AI' }, { provider_product_id: 'sku-2', name: 'Gói hai', price_usd: 3, in_stock: true, category: 'AI' }];
    const catalog = []; let posts = 0;
    await page.route('**/api/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const reply = json => route.fulfill({ json });
      if (path === '/api/admin/me') return reply({ userId: 'owner', email: 'owner@example.test', role: 'owner' });
      if (path === '/api/public/config') return reply({ adminAuthMode: 'session', adminUrl: '/admin' });
      if (path === '/api/admin/mmo/providers') return reply({ providers: [{ id: 'ncc', name: 'NCC', is_active: true }], usd_rate: 25000 });
      if (path === '/api/admin/mmo/products') return reply({ products });
      if (path === '/api/admin/catalog-config') return reply({ markupPercent: 20 });
      if (path === '/api/admin/products') {
        if (request.method() === 'POST') { posts++; catalog.push(request.postDataJSON()); return reply({ id: posts }); }
        return reply({ products: catalog });
      }
      return reply({ alerts: [], orders: [] });
    });
    await page.goto('http://127.0.0.1:4175/admin/vendor-catalog');
    await page.getByRole('checkbox', { name: 'Chọn Gói một' }).check();
    await page.getByRole('checkbox', { name: 'Chọn Gói hai' }).check();
    await page.getByRole('button', { name: /Kiểm tra trước khi lên kệ/ }).click();
    assert.equal(posts, 0);
    assert.equal(await page.getByLabel('Giá bán Gói một').inputValue(), '60000');
    await page.getByLabel('Giá bán Gói một').fill('65000');
    await page.getByRole('button', { name: 'Xác nhận lên kệ', exact: true }).click();
    await page.getByText('Đã lên kệ 2 sản phẩm', { exact: true }).waitFor();
    assert.equal(posts, 2); assert.equal(catalog[0].active, true); assert.equal(catalog[0].selling_price, 65000);
    console.log('PASS: bulk publish reviews editable prices before one confirmation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
