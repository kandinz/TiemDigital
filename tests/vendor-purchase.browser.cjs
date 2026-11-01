// Fixture-only browser test; no supplier or payment service is contacted.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    let purchases = 0, purchaseMode = 'unknown', createdStock;
    const supplierProduct = { provider_product_id: 'sku', name: 'Gói NCC', price_usd: 2, in_stock: true, category: 'AI' };
    await page.route('**/api/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const reply = json => route.fulfill({ json });
      if (path === '/api/admin/me') return reply({ userId: 'owner', email: 'owner@example.test', role: 'owner' });
      if (path === '/api/public/config') return reply({ adminAuthMode: 'session', adminUrl: '/admin' });
      if (path === '/api/admin/mmo/providers') return reply({ providers: [{ id: 'ncc', name: 'NCC', is_active: true }], usd_rate: 25000 });
      if (path === '/api/admin/mmo/products') return reply({ products: [supplierProduct] });
      if (path === '/api/admin/mmo/orders') return purchaseMode === 'saved' && purchases > 1 ? route.fulfill({ status: 503, json: { error: 'History unavailable' } }) : reply({ orders: [] });
      if (path === '/api/admin/products') {
        if (request.method() === 'POST') { createdStock = request.postDataJSON(); return reply({ id: 2 }); }
        return reply({ products: [{ id: 1, name: 'Kho AI', source: 'stock' }, ...(createdStock ? [{ ...createdStock, id: 2 }] : [])] });
      }
      if (path === '/api/admin/fulfillment-alerts') return reply({ alerts: [] });
      if (path === '/api/admin/mmo/order') { purchases++; return purchaseMode === 'unknown' ? route.abort('failed') : reply({ order_id: 'NCC-1', status: 'completed', persisted: true }); }
      return reply({});
    });
    await page.goto('http://127.0.0.1:4175/admin/vendor-catalog');
    const row = page.getByRole('row').filter({ hasText: 'Gói NCC' });
    await row.getByRole('button', { name: 'Mua dùng', exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await row.getByRole('button', { name: 'Mua nhập kho', exact: true }).count(), 1);
    await row.getByRole('button', { name: 'Mua nhập kho', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo nhanh sản phẩm kho', exact: true }).click();
    await page.getByLabel('Tên sản phẩm kho mới').fill('Kho mới');
    await page.getByLabel('Danh mục kho mới').fill('AI');
    await page.getByLabel('Giá bán kho mới').fill('120000');
    await page.getByRole('button', { name: 'Tạo và chọn kho', exact: true }).click();
    await page.getByText('Đã tạo sản phẩm kho chưa lên kệ.', { exact: true }).waitFor();
    assert.equal(createdStock.active, false, 'New stock product must not be published');
    assert.equal(await page.getByLabel('Sản phẩm kho nhận hàng').inputValue(), '2');
    await row.getByRole('button', { name: 'Mua dùng', exact: true }).click();
    await page.getByRole('button', { name: 'Mua từ NCC', exact: true }).click();
    await page.getByText(/chưa xác định.*không mua lại/i).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('button', { name: 'Mua từ NCC', exact: true }).isDisabled(), true);
    assert.equal(purchases, 1, 'An unknown supplier result must not trigger another purchase');
    await row.getByRole('button', { name: 'Mua dùng', exact: true }).click();
    await page.getByRole('checkbox', { name: /đã đối soát với NCC/ }).check();
    await page.getByRole('button', { name: 'Cho phép mua đơn mới', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Mua từ NCC', exact: true }).isDisabled(), false);
    assert.equal(purchases, 1, 'Unlocking after reconciliation must not buy again');
    purchaseMode = 'saved';
    await page.getByRole('button', { name: 'Mua từ NCC', exact: true }).click();
    await page.getByText(/đã mua.*không mua lại/i).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('button', { name: 'Mua từ NCC', exact: true }).isDisabled(), true);
    assert.equal(purchases, 2, 'A failure after a confirmed purchase must not buy again');
    console.log('PASS: distinct purchase actions and unknown supplier result handling.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
