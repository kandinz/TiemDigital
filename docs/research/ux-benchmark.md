# Benchmark UX shop sản phẩm số & admin vận hành

Research cho ticket "Benchmark UX shop sản phẩm số & admin vận hành" (#9) của map "Làm lại UI/UX storefront + admin" (#1). Bản rút gọn từ báo cáo của subagent research, ngày 2026-10-31.

Phạm vi: taphoammo.vn, G2A, Eneba, Kinguin, SEAGM, Codashop, Gumroad, Lemon Squeezy; VietQR; Shopify/Polaris, Stripe, Medusa, Linear; Baymard, NN/g.

## Mẫu chính theo nhóm

### (a) Tìm sản phẩm nhanh
- Danh mục theo **nhu cầu khách** ("Tài khoản AI", "Key bản quyền"…), tách khỏi cấu trúc nội bộ theo NCC; 1 sản phẩm gắn nhiều danh mục (NN/g).
- **Chip filter** hiển thị lựa chọn đang áp dụng, xoá nhanh từng chip (Baymard).
- **Bottom-sheet filter** trên mobile, tách Filter vs Sort (Baymard).
- Autocomplete + fuzzy tiếng Việt có/không dấu; gợi ý bán chạy khi ô tìm kiếm trống.
- Bottom nav mobile 4–5 mục.
- **Gộp biến thể** (1 tháng/3 tháng/1 năm) vào 1 thẻ sản phẩm.

### (b) Mua ít bước nhất
- **Guest checkout**: chỉ cần email/SĐT, mời tạo tài khoản *sau* khi thanh toán (Codashop, SEAGM).
- **VietQR động**: QR điền sẵn số tiền + nội dung, webhook tự xác nhận, trạng thái real-time, đếm ngược hết hạn.
- **Ví nội bộ**: nạp 1 lần, mua nhiều lần không cần QR lại (đặc trưng shop MMO VN).
- Form tối thiểu: sản phẩm, số lượng, liên hệ nhận hàng, phương thức thanh toán.
- Thanh tiến trình rõ: Chờ thanh toán → Đã thanh toán → Đang giao → Hoàn tất.

### (c) Tín hiệu tin cậy
- Giá cuối cùng ngay từ đầu, không phí ẩn/add-on ép mua (Eneba được đánh giá cao hơn G2A vì điểm này).
- **Chính sách bảo hành có con số cụ thể** hiển thị ngay trên trang sản phẩm.
- Review đã xác thực theo sản phẩm + điểm tổng shop.
- Badge "được xác minh" / người bán tin cậy.

### (d)–(f) Nhận hàng, dashboard owner, bảng dày trên mobile
Tóm trong Top 10 bên dưới (hạng 2, 3, 4, 5, 9, 10).

## Top 10 pattern nên áp dụng (xếp theo tác động / nỗ lực)

| Hạng | Pattern | Giải quyết |
|---|---|---|
| 1 | VietQR động + xác nhận tự động qua webhook + trạng thái real-time | Thanh toán nhiều bước |
| 2 | Dashboard admin: card "Cần xử lý hôm nay", bấm đi thẳng tới danh sách đã lọc | Không thấy ngay đơn cần xử lý |
| 3 | Giao hàng tức thời + "Thư viện đơn hàng của tôi" để khách tự xem lại | Giảm tải hỗ trợ cho owner |
| 4 | Bảng → card tự chuyển trên mobile + bulk action bar sticky | Admin mobile bất tiện, bảng khó đọc |
| 5 | Card lợi nhuận (Doanh thu – Giá vốn – Lợi nhuận) + bảng số dư NCC tổng hợp | Khó thấy lợi nhuận/số dư NCC |
| 6 | Ví nội bộ nạp 1 lần mua nhiều lần | Ma sát mua lặp lại |
| 7 | Chip filter + bottom-sheet filter trên mobile storefront | Tìm chậm, mobile khó dùng |
| 8 | Bảo hành có con số cụ thể + review đã xác thực trên sản phẩm | Trông không đáng tin |
| 9 | Thêm sản phẩm NCC bằng card/drawer chỉnh nhanh tại chỗ thay vì form nhiều bước | Thêm sản phẩm NCC chậm |
| 10 | Key/account có trạng thái vòng đời (chưa dùng/đã bán/thu hồi) trong kho | Nhập kho khó quản lý |

Lưu ý cho map: hạng 10 và phần "guest checkout" có thể đụng backend — cần đối chiếu với ticket "Kiểm kê màn hình & API frontend hiện có" vì map giữ nguyên backend.

## Độ tin cậy nguồn

- Khá vững: tài liệu Shopify/Polaris, Stripe, Medusa, Linear, Baymard, NN/g.
- Định hướng, chưa kiểm trực tiếp: mô tả UI Eneba/G2A/Kinguin/Codashop/SEAGM/taphoammo lấy từ bài review bên thứ ba — nên tự chụp màn hình kiểm tra trước khi sao chép chi tiết.
- Số liệu % (vd "giảm bỏ giỏ 24%", "78% site mobile lọc kém") chưa truy được báo cáo gốc.
- taphoammo.net không truy cập được; dùng thông tin taphoammo.vn.
