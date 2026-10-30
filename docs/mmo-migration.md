# Admin chung và dữ liệu nhà cung cấp

Production và local dùng `ADMIN_AUTH_MODE=session`: mở `/admin` trên cùng origin với website, đăng nhập bằng tài khoản TiệmDigital. `admin_accounts.user_id` gắn quyền với ID cố định của tài khoản Better Auth. Email và username trong hồ sơ có thể đổi mà không làm mất hoặc phát sinh quyền. Tài khoản bị khóa hoặc hết phiên không truy cập được API admin. Chế độ `access` vẫn được giữ cho môi trường cấu hình Cloudflare Access riêng.

## Cấp quyền

Tạo tài khoản trên website trước, áp dụng schema, rồi chạy:

```sh
node scripts/admin.mjs --username=khanhdq --role=owner --remote --env=production
```

Local bỏ `--remote --env=production`. Script báo lỗi nếu username không tồn tại. `--email` chỉ dành cho danh tính Cloudflare Access trong `admin_roles`; quyền của chế độ session luôn đọc `admin_accounts`. Không tự cấp Owner cho người đăng ký đầu tiên và không dùng email chưa xác minh để quyết định quyền.

Các chức năng NCC dùng chung admin React: `/admin/products`, `/admin/providers`, `/admin/orders` và `/admin/finance`. Không có tab MMO hoặc iframe riêng. Đường dẫn iframe cũ chuyển hướng về mục Sản phẩm; `/admin/mmo` mở mục Sản phẩm trong admin chung. Quyền Owner của các thao tác NCC được giữ nguyên. Backend adapter/đơn nhập/giao dịch cũ vẫn dùng namespace `/api/admin/mmo/*` để bảo toàn tích hợp và lịch sử. Các API ghi kiểm tra origin; danh tính Gum Tool/JWT Bearer không được dùng. Audit không ghi API key hoặc dữ liệu giao hàng.

Owner có lối vào `/admin/purchases` để tự mua từ NCC. Chọn **Dùng riêng** để xem dữ liệu giao trong chi tiết đơn, hoặc **Nhập vào kho** và chọn sản phẩm kho tự tạo. Đơn hoàn tất được nhập kho bằng dữ liệu mã hóa; nếu NCC giao muộn, mở chi tiết đơn, kiểm tra trạng thái rồi chọn **Nhập đơn này vào kho**. Thao tác nhập lại cùng đơn không tạo thêm hàng, và đơn đã gắn giao dịch bán không được nhập kho. **Ngừng bán** ẩn sản phẩm khỏi cửa hàng nhưng giữ lịch sử đơn và kho. Báo cáo MMO cũ hiển thị ở **Tài chính & báo cáo**, tách doanh thu, giá vốn, chi phí khác và lợi nhuận theo năm/tháng.

## Mã nguồn

- `workers/mmo`: API NCC, adapter, đơn mua, giao dịch, báo cáo, bảo hành và kệ bán lẻ từ Gum Tool.
- `src/components/admin/CommerceAdmin.tsx`: giao diện sản phẩm, NCC, đối soát, đơn nhập, giao dịch và bảo hành trong admin chung. `modules/mmo` là mã giao diện cũ, không được build/tải trong luồng quản trị hiện tại.
- `workers/mmo/schema.ts`: sáu bảng MMO và index, được gộp vào schema TiệmDigital. Không có SQL migration tĩnh.
- `workers/catalog.ts`, `workers/commerceSchema.ts`: danh mục chung, % lợi nhuận, kho mã hóa và ánh xạ dữ liệu bán lẻ cũ vào `products`; website chỉ gọi `/api/catalog` nội bộ. Script `sync-catalog.mjs` đã dừng nhập từ Gum Tool.
- `workers/fulfillment.ts`: sau thanh toán, tự mua NCC hoặc xuất kho, giao một phần và chuyển ngoại lệ cho admin. Không giữ kho khi tạo đơn; khách thanh toán trước được ưu tiên. Webhook/tác vụ chạy lại không được mua hoặc giao trùng.

`npm run typecheck`, `npm test`, `npm run build`, `npm run check:pages` kiểm tra Worker và giao diện React hiện tại. Build mặc định không tạo ứng dụng Vue riêng.

`node tests/migrate-mmo.node.mjs` kiểm tra ánh xạ chủ sở hữu và đối chiếu dữ liệu. `node tests/admin-commerce.browser.cjs` kiểm tra admin chung trên Vite preview bằng API fixtures, không gọi NCC, thanh toán hoặc gửi Telegram thật; cần Playwright qua `NODE_PATH`. `tests/unified-commerce.test.ts` kiểm tra API/D1, thanh toán, FIFO kho, giá NCC, giao một phần và đối soát với outbound mocks.

## Vận hành danh mục và giao hàng

Áp dụng schema bằng `node scripts/schema.mjs` cho local; môi trường remote cần `--remote --env=<môi trường>`. Các bảng mới được thêm cộng dồn; sản phẩm và lịch sử đơn cũ giữ nguyên ID. `catalog_imports` ánh xạ sản phẩm bán lẻ cũ sang ID mới trong `products` để tránh nhầm với sản phẩm hiện có. Nếu chuyển thêm dữ liệu bằng script migration bên dưới, áp dụng lại schema để đưa kệ bán lẻ vừa chuyển vào danh mục chung. Schema có thể chạy lại.

Trước khi bật tự giao, cấu hình `DELIVERY_KEY` và nhập kho hoặc liên kết sản phẩm NCC, cấu hình tỷ giá và % lợi nhuận mặc định/từng sản phẩm. API key của NCC chỉ cấu hình tại Nhà cung cấp. Giá gợi ý bằng giá nhập nhân (1 + %); admin được sửa tay. Khi NCC tăng giá, tăng giá bán cùng tỷ lệ kể cả giá sửa tay; giảm giá nhập thì giữ nguyên giá bán. Đồng bộ và kiểm tra trước khi mua không sửa giá đã chốt của đơn.

Cron hiện có chạy mỗi 5 phút: đồng bộ giá/tồn NCC, xử lý thanh toán tồn đọng, tự giao hàng và gửi thông báo. Tác vụ mua đã ở PROCESSING nhưng quá hạn mà chưa có kết quả chuyển đối soát, không tự mua lại. NCC thất bại/hết hàng, kho tự tạo hết sau thanh toán, hoặc giá nhập vượt giá của đơn đã trả tiền đều báo admin; không tự hoàn tiền hay thu thêm.

Cấu hình Telegram Chat ID quản trị tại Nhà cung cấp và secret `TELEGRAM_BOT_TOKEN`. Cảnh báo luôn lưu trong admin; lỗi gửi Telegram có retry và được xem/gửi lại trong Telegram & hệ thống. Admin đối soát rồi bổ sung dữ liệu còn thiếu hoặc xác nhận chưa có giao dịch mua thành công trước khi cho phép thử lại. Hoàn tiền tiếp tục dùng quy trình phê duyệt tài chính hiện có.

## Chuyển dữ liệu

`scripts/migrate-mmo.mjs` mặc định chạy thử. Đọc nguồn từ `.env` và `wrangler.toml` ở dự án Gum Tool, đích từ `wrangler.worker.jsonc`. Đích dùng token `.env` hoặc profile OAuth Wrangler được chỉ định rõ bằng `--target-oauth` và `--target-account`.

```sh
node scripts/migrate-mmo.mjs --source="D:/Project/Gum Tool" --owner=khanhdq --env=production
```

Thêm `--apply` để thực hiện. Script:

1. Kiểm tra nguồn/đích khác nhau, tài khoản đích tồn tại, bảng đích rỗng hoặc khớp hoàn toàn dữ liệu dự kiến; từ chối ghi đè dữ liệu khác.
2. Lưu snapshot nguồn vào `.wrangler/mmo-migration/<timestamp>/source.json`. Thư mục này bị Git bỏ qua và chứa dữ liệu bí mật; chỉ giữ trong môi trường quản trị.
3. Tạo schema cộng thêm, giữ nguyên ID, API key, dữ liệu giao hàng và liên kết đơn mua–giao dịch. Gắn `user_id` của đơn mua/giao dịch vào Owner đã chọn.
4. Đối chiếu số dòng và SHA-256 của toàn bộ giá trị từng bảng, kiểm tra nguồn không thay đổi trong lúc chuyển, rồi cấp Owner.
5. Lưu kết quả vào `verification.json`. Không ghi, xóa hoặc chuyển hướng traffic ở Gum Tool. Nếu nguồn tiếp tục có giao dịch sau snapshot, phải đối soát phần phát sinh trước khi chuyển hẳn vận hành.

Ngày 29/10/2026 đã chuyển và đối chiếu production cho `khanhdq`: 19 NCC, 1 cấu hình tỷ giá, 21 danh mục, 69 đơn mua, 77 giao dịch và 5 sản phẩm bán lẻ. Mọi cột được đối chiếu sau khi ánh xạ chủ sở hữu. Không thực hiện mua NCC thật trong quá trình kiểm thử.

Nếu nguồn tiếp tục hoạt động, `--catch-up --apply` cho phép chép bổ sung bản ghi mới khi dữ liệu đích là tập con tương thích của nguồn. Không ghi đè bản ghi hiện có; từ chối nếu cấu hình, API key, đơn hoặc giao dịch đã khác. Chỉ bỏ qua hai cột cache số dư NCC khi đối chiếu chế độ này. Trong lần chuyển này đã chép bổ sung một đơn phát sinh ở nguồn sau snapshot đầu, nâng tổng đơn mua ở đích lên **70**.
