// Fixture-only browser test. NODE_PATH must include Playwright.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const balance of [100000, 1000]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      const requests = [];
      let deliveryReads = 0;
      const product = { id: 1, name: 'Gói kiểm thử', description: '', category: 'Công cụ', selling_price: 20000, in_stock: true };
      const order = { id: 'TD-TEST', total: 20000, payment_status: 'UNPAID', fulfillment_status: 'NOT_READY', items: [{ productId: 1, name: product.name, price: 20000, quantity: 1 }] };
      await page.route('**/api/**', async (route) => {
        const request = route.request(), path = new URL(request.url()).pathname;
        requests.push({ path, method: request.method() });
        const reply = (json, status = 200) => route.fulfill({ json, status });
        if (path === '/api/catalog') return reply({ products: [product], categories: ['Công cụ'] });
        if (path === '/api/public/config') return reply({});
        if (path === '/api/me') return reply({ id: 'test', name: 'Khách kiểm thử', email: '' });
        if (path === '/api/me/wallet') return reply({ balance });
        if (path === '/api/orders') return reply(order);
        if (path === '/api/orders/TD-TEST/payments/wallet') return reply({ ...order, payment_status: 'PAID', fulfillment_status: 'QUEUED' });
        if (path === '/api/orders/TD-TEST') return reply({ ...order, payment_status: 'PAID', fulfillment_status: 'DELIVERED', fulfillments: [{ product_id: 1, name: product.name, quantity: 1, status: 'DELIVERED', reason: null, delivered_quantity: 1 }] });
        if (path === '/api/orders/TD-TEST/delivery') return ++deliveryReads === 1 ? reply({ error: 'Preparing' }, 409) : reply({ value: 'fixture-delivery-value' });
        if (path === '/api/orders/TD-TEST/payments/qr') return reply({ id: 'intent', purpose: 'ORDER', orderId: order.id, amount: order.total, status: 'PENDING', expiresAt: Math.floor(Date.now() / 1000) + 600, bankName: 'Test', accountNumber: '0000', accountHolder: 'TEST', memo: 'TEST', qrUrl: '/test-qr' });
        return reply({ error: `Unexpected endpoint ${path}` }, 500);
      });
      await page.goto('http://127.0.0.1:4175/');
      await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Thanh toán' });
      await dialog.getByText(/Số dư khả dụng/).waitFor();
      assert.equal(requests.filter(x => x.path === '/api/orders').length, 0, 'Opening checkout must not create an order');
      const wallet = dialog.getByRole('radio', { name: /Ví TiệmDigital/ });
      const qr = dialog.getByRole('radio', { name: /Chuyển khoản QR/ });
      assert.equal(await (balance >= order.total ? wallet : qr).isChecked(), true, 'Default payment must follow balance');
      await dialog.getByRole('button', { name: /Xác nhận thanh toán/ }).click();
      await page.waitForTimeout(300);
      assert.equal(requests.filter(x => x.path === '/api/orders' && x.method === 'POST').length, 1);
      assert.equal(requests.filter(x => x.path.endsWith(balance >= order.total ? '/payments/wallet' : '/payments/qr')).length, 1);
      if (balance >= order.total) {
        await page.getByRole('dialog', { name: 'Thanh toán thành công' }).getByText('fixture-delivery-value', { exact: true }).waitFor({ timeout: 8000 });
        assert.equal(await page.getByRole('button', { name: 'Sao chép dữ liệu' }).count(), 1);
      }
      await page.close();
    }
    {
      const page = await browser.newPage();
      let creates = 0, payments = 0;
      const item = { id: 7, name: 'Giá thay đổi', description: '', category: 'Test', selling_price: 20000, in_stock: true };
      const changed = { id: 'TD-CHANGED', total: 30000, payment_status: 'UNPAID', fulfillment_status: 'NOT_READY', items: [] };
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const reply = json => route.fulfill({ json });
        if (path === '/api/catalog') return reply({ products: [item], categories: ['Test'] });
        if (path === '/api/me') return reply({ id: 'test', name: 'Khách kiểm thử', email: '' });
        if (path === '/api/me/wallet') return reply({ balance: 100000 });
        if (path === '/api/orders') { creates++; return reply(changed); }
        if (path === '/api/orders/TD-CHANGED/payments/qr') { payments++; return reply({ id: 'intent-changed', purpose: 'ORDER', orderId: changed.id, amount: changed.total, status: 'PENDING', expiresAt: Math.floor(Date.now() / 1000) + 600, bankName: 'Test', accountNumber: '0000', accountHolder: 'TEST', memo: 'TEST', qrUrl: '/test-qr' }); }
        return route.fulfill({ status: 500, json: { error: `Unexpected ${path}` } });
      });
      await page.goto('http://127.0.0.1:4175/');
      await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Thanh toán' });
      await dialog.getByText(/Số dư khả dụng/).waitFor();
      await dialog.getByRole('radio', { name: /Chuyển khoản QR/ }).check();
      await dialog.getByRole('button', { name: /Xác nhận thanh toán/ }).click();
      await dialog.getByRole('alert').getByText(/Giá đã thay đổi/).waitFor();
      assert.equal(creates, 1);
      assert.equal(payments, 0, 'A changed price requires another confirmation');
      await dialog.getByRole('button', { name: /Xác nhận thanh toán/ }).click();
      await dialog.getByText('TEST', { exact: true }).first().waitFor();
      assert.equal(creates, 1, 'The existing order is reused');
      assert.equal(payments, 1, 'The chosen QR method is preserved');
      await page.close();
    }
    {
      const page = await browser.newPage(); let creates = 0, pays = 0;
      const item = { id: 9, name: 'Gói mạng lỗi', description: '', category: 'Test', selling_price: 20000, in_stock: true };
      const order = { id: 'TD-NET', total: 20000, payment_status: 'UNPAID', fulfillment_status: 'NOT_READY', items: [] };
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const reply = json => route.fulfill({ json });
        if (path === '/api/catalog') return reply({ products: [item], categories: ['Test'] });
        if (path === '/api/me') return reply({ id: 'test', name: 'Khách kiểm thử', email: '' });
        if (path === '/api/me/wallet') return reply({ balance: 100000 });
        if (path === '/api/orders') { creates++; return reply(order); }
        if (path === '/api/orders/TD-NET/payments/wallet') { pays++; return route.abort('failed'); }
        if (path === '/api/orders/TD-NET') return reply({ ...order, payment_status: 'PAID' });
        if (path === '/api/orders/TD-NET/delivery') return reply({ value: 'đã giao' });
        return reply({});
      });
      await page.goto('http://127.0.0.1:4175/');
      await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Thanh toán' });
      await dialog.getByText(/Số dư khả dụng/).waitFor();
      await dialog.getByRole('button', { name: /Xác nhận thanh toán/ }).click();
      await dialog.getByRole('alert').waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Thanh toán' });
      await dialog.getByText(/Số dư khả dụng/).waitFor();
      await dialog.getByRole('button', { name: /Xác nhận thanh toán/ }).click();
      await page.getByRole('dialog', { name: 'Thanh toán thành công' }).waitFor();
      assert.equal(creates, 1); assert.equal(pays, 1, 'Must check the previous payment before trying again');
      await page.close();
    }
    console.log('PASS: checkout chooses wallet or QR and confirms once.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
