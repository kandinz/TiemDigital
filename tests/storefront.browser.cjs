// NODE_PATH=<Playwright package directory> node tests/storefront.browser.cjs
// API fixtures isolate the browser from real email, orders and payments.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.STOREFRONT_URL || 'http://localhost:8787';
const products = [
  { id: 1, name: 'Claude API 50M Tokens 2day', category: 'Claude', selling_price: 99000, description: 'Hướng dẫn: https://example.com/guide', image_url: null, in_stock: true },
  { id: 2, name: 'Gemini Pro 3 Months', category: 'Gemini', selling_price: 69000, description: 'Gói 3 tháng.', image_url: null, in_stock: true },
  { id: 3, name: 'Claude API 30days', category: 'Claude', selling_price: 49000, description: 'Gói 30 ngày.', image_url: null, in_stock: false },
];
const customer = { id: 'browser-test', name: 'Khách kiểm thử', email: 'browser@example.com' };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [], unexpected = [], orders = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let loggedIn = false, catalogFails = false, emptyCatalog = false, wallet = 300000, topups = 0, walletPayments = 0, qrPayments = 0;
    let intent;
    const intentData = { bankName: 'Test bank', accountNumber: '123456', accountHolder: 'TEST', memo: 'TEST', qrUrl: 'https://example.com/qr.png', expiresAt: Math.floor(Date.now() / 1000) + 600, status: 'PENDING' };
    await context.route('https://example.com/**', (route) => route.abort());
    await context.route('**/api/**', async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const reply = (json, status = 200) => route.fulfill({ json, status });
      if (path === '/api/catalog') return catalogFails ? reply({ error: 'Catalog unavailable' }, 503) : reply({ products: emptyCatalog ? [] : products, categories: ['Claude', 'Gemini'] });
      if (path === '/api/public/config') return reply({ turnstileSiteKey: null });
      if (path === '/api/auth/email-otp/send-verification-otp') return reply({ success: true });
      if (path === '/api/auth/sign-in/email-otp') { loggedIn = true; return reply({ user: customer }); }
      if (path === '/api/auth/sign-out') { loggedIn = false; return reply({ success: true }); }
      if (path === '/api/auth/list-sessions') return reply([]);
      if (path === '/api/me') return loggedIn ? reply(customer) : reply({ error: 'Đăng nhập để tiếp tục.' }, 401);
      if (path === '/api/me/wallet') return reply({ balance: wallet });
      if (path === '/api/me/wallet/transactions') return reply({ transactions: [] });
      if (path === '/api/me/orders') return reply({ orders });
      if (path === '/api/me/topups') {
        topups++; assert.equal(request.postDataJSON().amount, 100000);
        intent = { ...intentData, id: 'intent-topup', purpose: 'TOPUP', orderId: null, amount: 100000 };
        return reply(intent);
      }
      if (path.startsWith('/api/intents/')) {
        if (intent.status !== 'SUCCEEDED') {
          if (intent.purpose === 'TOPUP') wallet += intent.amount;
          else orders.find((order) => order.id === intent.orderId).payment_status = 'PAID';
          intent.status = 'SUCCEEDED';
        }
        return reply(intent);
      }
      if (path === '/api/orders' && request.method() === 'POST') {
        const body = request.postDataJSON();
        assert.equal(body.items.length, 1, 'Each direct purchase must contain only the chosen product');
        assert.ok(request.headers()['idempotency-key']);
        const items = body.items.map(({ productId, quantity }) => { const product = products.find((item) => item.id === productId); return { productId, quantity, name: product.name, price: product.selling_price }; });
        const order = { id: `TDTEST${orders.length + 1}`, user_id: customer.id, channel: 'web', currency: 'VND', total: items.reduce((sum, item) => sum + item.price * item.quantity, 0), customer: body.customer, items, payment_status: 'UNPAID', fulfillment_status: 'NOT_READY', created_at: Math.floor(Date.now() / 1000) };
        orders.push(order); return reply(order);
      }
      const match = path.match(/^\/api\/orders\/(TDTEST\d+)(?:\/payments\/(wallet|qr)|\/(delivery))?$/);
      if (match) {
        const order = orders.find((item) => item.id === match[1]);
        if (match[2] === 'wallet') { walletPayments++; wallet -= order.total; order.payment_status = 'PAID'; return reply(order); }
        if (match[2] === 'qr') { qrPayments++; intent = { ...intentData, id: `intent-${order.id}`, purpose: 'ORDER', orderId: order.id, amount: order.total }; return reply(intent); }
        return match[3] ? reply({ value: 'fixture-delivery-value' }) : reply(order);
      }
      unexpected.push(path); return reply({ error: `Unexpected API ${path}` }, 500);
    });

    await page.goto(origin); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.product-card').count(), 3);
    assert.equal(await page.getByRole('button', { name: /Giỏ hàng|Thêm .* vào giỏ/ }).count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Số dư', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Gemini', exact: true }).click();
    assert.equal(await page.locator('.product-card').count(), 1);
    await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
    await page.getByRole('searchbox').fill('not-a-product');
    await page.getByRole('heading', { name: 'Không tìm thấy sản phẩm' }).waitFor();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await page.getByRole('combobox').selectOption('price-asc');
    assert.equal(await page.locator('.product-card').first().getByRole('button', { name: 'Hết hàng', exact: true }).isDisabled(), true);
    await page.getByRole('combobox').selectOption('default');
    await page.getByRole('button', { name: 'Xem chi tiết Claude API 50M Tokens 2day' }).click();
    await page.getByRole('spinbutton').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Mua ngay', exact: true }).click();
    await page.getByRole('link', { name: 'Đăng nhập bằng email' }).click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(customer.email);
    await page.getByRole('button', { name: 'Gửi mã đăng nhập' }).click();
    await page.getByRole('textbox', { name: 'Mã gồm 6 số' }).fill('123456');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('dialog', { name: 'Thanh toán' }).getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).waitFor();
    assert.match(await page.locator('.receipt-lines').innerText(), /Claude API.*× 2/);
    await page.keyboard.press('Escape');
    // Abandoning Claude must not add it to the next Gemini order.
    await page.locator('.product-card').filter({ hasText: 'Gemini Pro' }).getByRole('button', { name: 'Mua ngay', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Số lượng', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).click();
    await page.getByRole('button', { name: 'Thanh toán bằng số dư', exact: true }).click();
    await page.getByRole('dialog', { name: 'Thanh toán thành công' }).waitFor();
    assert.deepEqual(orders[0].items.map(({ productId, quantity }) => ({ productId, quantity })), [{ productId: 2, quantity: 2 }]);
    assert.equal(orders[0].total, 138000); assert.equal(walletPayments, 1);
    await page.getByRole('button', { name: 'Tiếp tục mua hàng' }).click();
    await page.locator('.profile-balance').filter({ hasText: '162.000 ₫' }).waitFor();
    await page.locator('.profile-menu summary').click();
    await page.getByRole('link', { name: 'Nạp tiền & giao dịch' }).click();
    await page.getByRole('button', { name: 'Tạo QR nạp tiền' }).click();
    await page.locator('.profile-balance').filter({ hasText: '262.000 ₫' }).waitFor();
    assert.equal(topups, 1);
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Sản phẩm' }).click();
    await page.getByRole('button', { name: 'Xem chi tiết Claude API 50M Tokens 2day' }).click();
    await page.getByRole('spinbutton').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Mua ngay', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).click();
    await page.getByRole('button', { name: 'Quét QR ngân hàng' }).click();
    await page.getByRole('dialog', { name: 'Thanh toán thành công' }).waitFor();
    assert.equal(qrPayments, 1); assert.equal(orders[1].total, 198000);
    assert.deepEqual(orders[1].items.map(({ productId, quantity }) => ({ productId, quantity })), [{ productId: 1, quantity: 2 }]);
    await page.getByRole('link', { name: 'Xem đơn hàng', exact: true }).click();
    await page.getByRole('button', { name: 'Nhận sản phẩm' }).last().click();
    await page.getByText('fixture-delivery-value', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Hỗ trợ' }).click();
    assert.equal(await page.getByRole('link', { name: 'Nhắn @kandinz' }).getAttribute('href'), 'https://t.me/kandinz');
    catalogFails = true;
    await page.goto(origin); await page.getByRole('alert').waitFor();
    catalogFails = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await page.locator('.product-card').first().waitFor();
    emptyCatalog = true;
    await page.reload(); await page.getByRole('heading', { name: 'Chưa có sản phẩm' }).waitFor();
    await context.close();

    for (const width of [320, 390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
      const responsive = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      await responsive.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({ json: path === '/api/catalog' ? { products, categories: ['Claude', 'Gemini'] } : path === '/api/me' ? customer : { balance: 250000 } });
      });
      const view = await responsive.newPage();
      await view.goto(origin); await view.locator('.profile-balance').waitFor();
      assert.equal(await view.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}/${colorScheme}`);
      const accountBox = await view.locator('.shop-account').boundingBox();
      assert.ok(accountBox.x + accountBox.width / 2 > width / 2, 'Profile must be on the right');
      assert.match(await view.locator('.profile-balance').innerText(), /250\.000/);
      await responsive.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('PASS: direct purchases stay separate, guest login resumes selection, wallet/QR payments, profile balance/topup, delivery, support, catalog states and 8 responsive/theme combinations.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
