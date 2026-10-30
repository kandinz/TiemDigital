// Fixture-only regression checks; never contacts payment or supplier services.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.STOREFRONT_URL || 'http://localhost:4175';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let balance = 0, qrCreates = 0;
    const order = { id: 'TDTEST1', payment_status: 'UNPAID', total: 10000, currency: 'VND', items: [] };
    const intent = (expired) => ({ id: expired ? 'OLDQR' : 'NEWQR', status: expired ? 'EXPIRED' : 'PENDING', expiresAt: Math.floor(Date.now() / 1000) + (expired ? -10 : 600), amount: 10000, purpose: 'ORDER', orderId: order.id, bankName: 'Fixture', accountNumber: '123456', accountHolder: 'TEST', memo: 'TEST', qrUrl: '/fixture-qr.png' });
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const reply = json => route.fulfill({ json });
      if (path === '/api/catalog') return reply({ products: [{ id: 1, name: 'Fixture', category: 'Test', description: '', selling_price: 10000, in_stock: true }], categories: ['Test'] });
      if (path === '/api/public/config') return reply({});
      if (path === '/api/me') return reply({ id: 'fixture', name: 'Fixture', email: 'fixture@example.test' });
      if (path === '/api/me/wallet') return reply({ balance });
      if (path === '/api/orders' || path === '/api/orders/TDTEST1') return reply(order);
      if (path === '/api/orders/TDTEST1/payments/qr') { qrCreates++; return reply(intent(qrCreates === 1)); }
      if (path === '/api/intents/OLDQR') return reply(intent(true));
      if (path === '/api/intents/NEWQR') return reply(intent(false));
      return route.fulfill({ status: 500, json: { error: `Unexpected ${path}` } });
    });
    await page.goto(`${origin}/?buy=1&quantity=1`);
    await page.getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).click();
    const wallet = page.getByRole('button', { name: 'Thanh toán bằng số dư', exact: true });
    await page.getByText(/Còn thiếu/).waitFor();
    assert.equal(await wallet.isDisabled(), true);
    balance = 20000;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Thanh toán bằng số dư').disabled);
    await page.getByRole('button', { name: 'Quét QR ngân hàng' }).click();
    await page.getByRole('button', { name: 'Tạo QR mới', exact: true }).click();
    await page.getByText(/QR còn hiệu lực/).waitFor();
    assert.equal(qrCreates, 2);
    assert.equal(await page.getByRole('button', { name: 'Tạo QR mới', exact: true }).count(), 0);
    console.log('PASS: wallet refresh after external topup and expired QR renewal.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
