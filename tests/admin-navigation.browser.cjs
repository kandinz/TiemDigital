// Fixture-only browser test. NODE_PATH must include Playwright.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    let orderQuery = '';
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const reply = json => route.fulfill({ json });
      if (path === '/api/admin/me') return reply({ userId: 'owner', username: 'owner', email: 'owner@example.test', role: 'owner' });
      if (path === '/api/public/config') return reply({ adminAuthMode: 'session', adminUrl: '/admin' });
      if (path === '/api/admin/overview') return reply({ payments: [], wallets: { liability: 0 }, review: { count: 1 }, backlog: { count: 0 } });
      if (path === '/api/admin/fulfillment-alerts') return reply({ alerts: [{ id: 'alert-1', order_id: 'TD-1042', name: 'Gói AI', reason: 'NCC_AWAITING_DELIVERY' }] });
      if (path === '/api/admin/orders') { orderQuery = new URL(route.request().url()).searchParams.get('q') || ''; return reply({ orders: [] }); }
      if (path === '/api/admin/mmo/providers') return reply({ success: true, providers: [], usd_rate: 25000 });
      if (path === '/api/admin/mmo/products') return reply({ success: true, products: [], provider_errors: [], provider_balances: [] });
      return reply({ products: [], categories: [], orders: [], customers: [], alerts: [] });
    });
    await page.goto('http://127.0.0.1:4175/admin');
    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản trị di động' });
    await navigation.waitFor({ timeout: 5000 });
    await page.getByText('TD-1042', { exact: true }).waitFor();
    await page.getByText(/1 khoản cần đối soát/).waitFor({ timeout: 5000 });
    assert.deepEqual(await navigation.getByRole('button').evaluateAll(buttons => buttons.map(button => button.querySelector('span').textContent)), ['Hôm nay', 'Sản phẩm', 'NCC', 'Đơn hàng', 'Tài chính']);
    await navigation.getByRole('button', { name: /Đơn hàng/ }).getByText('1', { exact: true }).waitFor({ timeout: 3000 });
    await page.getByText('Chưa đủ dữ liệu', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Xem đơn', exact: true }).click();
    await page.getByLabel('Tìm đơn khách hàng').waitFor();
    await page.waitForFunction(() => location.pathname.endsWith('/orders'));
    await page.waitForTimeout(300);
    assert.equal(orderQuery, 'TD-1042');
    await navigation.getByRole('button', { name: 'Sản phẩm', exact: true }).click();
    assert.equal(await page.getByRole('navigation', { name: 'Mục con quản trị' }).getByRole('button', { name: 'Kho', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Hàng từ NCC', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/admin/vendor-catalog');
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.getByRole('navigation', { name: 'Quản trị', exact: true }).getByRole('button', { name: /Đơn bán/ }).getByText('1', { exact: true }).waitFor();
    console.log('PASS: mobile admin has five primary sections and supplier catalog.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
