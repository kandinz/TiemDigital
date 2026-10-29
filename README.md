# Tiệm Digital

Cửa hàng sản phẩm số dùng React, TypeScript, Vite, Tailwind CSS và Cloudflare Workers/D1.

## Giao diện khách hàng

- `/`: mở thẳng danh mục, tìm kiếm, lọc danh mục, sắp xếp giá, xem chi tiết và mua hàng.
- Mua trực tiếp từng sản phẩm với số lượng đã chọn; mỗi lần thanh toán tạo một đơn riêng bằng số dư hoặc QR ngân hàng. Đăng nhập xong sẽ quay lại đúng sản phẩm đang mua.
- Danh mục nằm ở cột trái trên desktop, chuyển thành ô chọn trên điện thoại. Không hiển thị tiêu đề sản phẩm hoặc footer bản quyền.
- Đăng ký username/password, email tùy chọn; đăng nhập bằng username hoặc email cùng mật khẩu. Tài khoản cũ vẫn có thể dùng mã email.
- Đăng nhập bằng tài khoản Telegram đã tạo trong bot: mở bot, bấm xác nhận và quay lại trình duyệt; dùng nguyên tài khoản, đơn hàng và số dư hiện có.
- Menu tài khoản nằm bên phải, hiển thị số dư ngay khi đăng nhập; nạp tiền và giao dịch mở từ menu này.
- Header chỉ giữ logo và tài khoản. Trang mặc định hiển thị sản phẩm; nút hỗ trợ cố định góc dưới bên phải mở Telegram @kandinz.
- `/account#orders`: theo dõi thanh toán và nhận sản phẩm.
- `/account#wallet`: số dư, nạp tiền qua QR và lịch sử giao dịch.
- `/account#security`: cập nhật tên hiển thị, username, email tùy chọn và đổi mật khẩu. Tài khoản Telegram chưa có mật khẩu có thể tạo mật khẩu tại đây.
- Nút **Mở bot Telegram** ở danh mục trang chủ mở [@tiemdigital_bot](https://t.me/tiemdigital_bot).
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

`/admin` đăng nhập bằng tài khoản TiệmDigital đã được cấp quyền. Owner mở module MMO tại `/admin/mmo`; hướng dẫn cấp quyền và chuyển dữ liệu từ Gum Tool nằm trong [docs/mmo-migration.md](docs/mmo-migration.md). cấu hình và quy trình triển khai nằm trong [docs/operations.md](docs/operations.md). Trang nội dung đã xuất bản vẫn được phục vụ tại `/pages/:slug`.

Cloudflare Pages tự đọc `wrangler.jsonc` để build/deploy frontend và Pages Functions. Backend, database, môi trường local/staging/production dùng riêng `wrangler.worker.jsonc`; các lệnh Worker phải truyền `--config wrangler.worker.jsonc`. CI kiểm tra cấu hình Pages bằng chính bước `build-env` trước khi xác nhận bản build hợp lệ.
