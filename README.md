# Tiệm Digital — Nền Tảng Phân Phối Tài Khoản AI & Token Bản Quyền

> Phiên bản nền tảng thanh toán: tài khoản email OTP, số dư VND, QR TPBank qua SePay, admin/CMS và bot Telegram Stars chạy trên Cloudflare Workers/D1. Xem [hướng dẫn chạy, cấu hình và giới hạn vận hành](docs/operations.md). Phần giới thiệu giao diện ban đầu bên dưới có một số mô tả cũ (localStorage đơn hàng, MB, voucher, MoMo) đã được thay thế; không dùng làm đặc tả thanh toán hiện hành.

Trang bán hàng trực tuyến chuyên nghiệp cho thương hiệu **Tiệm Digital**, tích hợp đồng bộ dữ liệu thời gian thực từ [Swagger GumTool Catalog API](https://gumtool.pages.dev/product/swagger).

---

## 🌟 Tính Năng Nổi Bật

### 1. Đồng Bộ & Tích Hợp Live API
- Kết nối trực tiếp endpoint `GET https://gumtool.pages.dev/api/mmo/catalog`.
- Hỗ trợ tìm kiếm thời gian thực (`search`), bộ lọc danh mục động (`category`), phân loại giá (`price filter`) và sắp xếp (`sort`).
- Bộ đệm dữ liệu dự phòng thông minh (Resilient Cache), giúp website luôn tải mượt mà ngay cả khi ngoại tuyến hoặc gặp sự cố mạng.

### 2. Trải Nghiệm Mua Sắm Số (Digital Storefront)
- **Danh mục sản phẩm thông minh:** Nhãn thương hiệu nhận diện tự động (Anthropic Claude, Google Gemini, Muse AI, OpenAI), thẻ số lượng token, thời hạn gói và chính sách bảo hành.
- **Xem nhanh chi tiết (Quick View Modal):** Hiển thị toàn bộ đặc tả, hướng dẫn cài đặt và trích xuất tự động các liên kết kích hoạt (MiraiAPI, Bedrock, Google Docs, Disposable Email) kèm nút sao chép link 1-click.
- **Giỏ hàng trượt (Slide-over Cart):** Thêm/xóa sản phẩm, điều chỉnh số lượng tức thì và hỗ trợ áp dụng mã giảm giá voucher (`TIEMDIGITAL`, `WELCOME15K`, `AI2026`).

### 3. Thanh Toán & Đặt Hàng Chuyên Nghiệp
- **VietQR Ngân Hàng Tự Động:** Tạo mã QR VietQR chuẩn Napas247 đi kèm mã đơn hàng duy nhất (`#TDxxxx`), số tiền chính xác và thông tin chủ tài khoản.
- **Nút sao chép 1 chạm:** Copy nhanh Số tài khoản, Số tiền và Nội dung chuyển khoản.
- **Hỗ trợ đa kênh:** Tích hợp tùy chọn thanh toán qua Ví MoMo hoặc kết nối trực tiếp với CSKH qua Zalo/Telegram.
- **Hiệu ứng chúc mừng Confetti:** Hiển thị biên lai đơn hàng và hướng dẫn nhận tài khoản qua Email.

### 4. Tra Cứu Đơn Hàng (Order Tracking)
- Khách hàng có thể tra cứu tình trạng xử lý đơn hàng theo Mã đơn (`#TDxxxx`).
- Lưu trữ lịch sử giao dịch trực tiếp trên trình duyệt bằng LocalStorage.

### 5. Giao Diện & Thiết Kế
- **Giao diện Kép (Dark / Light Mode):** Tông màu Dark Tech sang trọng kết hợp màu ngọc lục bảo (Emerald Green) và dạ quang (Neon Cyan).
- **Responsive 100%:** Tối ưu hóa trải nghiệm trên Mobile, Tablet và Desktop.
- Nút hỗ trợ trực tuyến nổi (Floating Support) góc màn hình kết nối Zalo, Telegram và Hotline 24/7.

---

## 🛠 Công Nghệ Sử Dụng

- **Frontend Core:** React 19 + TypeScript
- **Bundler:** Vite 6
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`)
- **Icons:** Lucide React
- **Hiệu ứng:** Canvas Confetti

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### Yêu cầu môi trường:
- Node.js >= 18.x
- npm >= 9.x

### Khởi chạy môi trường phát triển (Development):
```bash
npm install
npm run dev
```

### Đóng gói sản xuất (Production Build):
```bash
npm run build
npm run preview
```

---

## 📋 Bản Quyền & Tác Giả

- **Thương hiệu:** Tiệm Digital
- **Bản quyền:** © 2026 Tiệm Digital. Toàn bộ quyền được bảo lưu.
