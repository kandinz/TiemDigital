# Tiệm Digital

Cửa hàng sản phẩm số dùng React, TypeScript, Vite, Tailwind CSS và Cloudflare Workers/D1.

## Giao diện khách hàng

- `/`: mở thẳng danh mục, tìm kiếm, lọc danh mục, sắp xếp giá, xem chi tiết và mua hàng.
- Mua trực tiếp từng sản phẩm với số lượng đã chọn; mỗi lần thanh toán tạo một đơn riêng bằng số dư hoặc QR ngân hàng. Đăng nhập email OTP xong sẽ quay lại đúng sản phẩm đang mua.
- Menu tài khoản nằm bên phải, hiển thị số dư ngay khi đăng nhập; nạp tiền và giao dịch mở từ menu này.
- `/account#orders`: theo dõi thanh toán và nhận sản phẩm.
- `/account#wallet`: số dư, nạp tiền qua QR và lịch sử giao dịch.
- `/account#security`: tên hiển thị và quản lý phiên đăng nhập.
- `/pages/lien-he`: hỗ trợ qua [Telegram @kandinz](https://t.me/kandinz).

Giao diện tự chọn sáng/tối theo thiết bị, đồng thời giữ lựa chọn đã lưu từ phiên bản trước. Các trang tài khoản, hỗ trợ và quản trị chỉ tải mã khi được mở.

## Chạy local

```sh
npm install
npm run schema:local
npm run dev
```

Truy cập `http://localhost:8787` (hostname này phải khớp `APP_ORIGIN`). Cấu hình dịch vụ xem trong `.dev.vars.example` và [docs/operations.md](docs/operations.md). Danh mục lấy từ `/api/catalog` trên D1; database local mới có thể chưa có sản phẩm.

## Kiểm tra

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run check:pages
```

`tests/storefront.browser.cjs` kiểm tra giao diện trên Chromium với API giả lập, gồm mua trực tiếp, đăng nhập, nạp tiền, tách riêng các đơn mua, nhận sản phẩm, menu tài khoản, hỗ trợ và responsive. `tests/ui-theme.browser.cjs` đo tương phản chữ ở đăng nhập, OTP, lỗi, ví, hồ sơ và hỗ trợ trong cả hai chế độ sáng/tối. Cần Playwright có sẵn và server local đang chạy:

```sh
node tests/storefront.browser.cjs
node tests/ui-theme.browser.cjs
```

Nếu Playwright nằm ngoài `node_modules` của dự án, đặt `NODE_PATH` tới thư mục package tương ứng. Có thể đặt `STOREFRONT_URL` để kiểm tra một địa chỉ local khác. Bài kiểm tra chặn API bằng fixture và không gửi giao dịch thật.

## Vận hành

`/admin` dành cho quản trị theo quyền; cấu hình và quy trình triển khai nằm trong [docs/operations.md](docs/operations.md). Trang nội dung đã xuất bản vẫn được phục vụ tại `/pages/:slug`.

Cloudflare Pages tự đọc `wrangler.jsonc` để build/deploy frontend và Pages Functions. Backend, database, môi trường local/staging/production dùng riêng `wrangler.worker.jsonc`; các lệnh Worker phải truyền `--config wrangler.worker.jsonc`. CI kiểm tra cấu hình Pages bằng chính bước `build-env` trước khi xác nhận bản build hợp lệ.
