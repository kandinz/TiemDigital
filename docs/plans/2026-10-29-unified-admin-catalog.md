# Thiết kế hợp nhất admin và danh mục sản phẩm

Ngày: 2026-10-29 (Asia/Bangkok).

Trạng thái: Người dùng đã yêu cầu triển khai qua skill implement. Thiết kế này là cơ sở triển khai và kiểm thử; chưa triển khai lên production.

Nguồn quyết định: [ADR](../decisions/2026-10-29-unified-admin-catalog.md). Thuật ngữ: [Glossary](../glossary.md).

## Kết quả cần đạt

Tất cả chức năng hiện có của MMO trở thành chức năng trong admin TiệmDigital, dùng chung giao diện và điều hướng. Bỏ tab MMO và iframe ứng dụng quản trị riêng. Trang sản phẩm lấy danh mục được admin TiệmDigital cấu hình, không phụ thuộc API Gum Tool.

| Mục admin | Chức năng đã được chốt |
| --- | --- |
| Sản phẩm | Danh mục bán, chọn hàng NCC, kho key/tài khoản, cấu hình giá |
| Nhà cung cấp | Kết nối API, số dư, đồng bộ danh mục NCC |
| Đơn hàng | Đơn khách, đơn nhập NCC, giao hàng, đối soát, bảo hành |
| Tổng quan / Tài chính | Doanh thu, chi phí, lợi nhuận và giao dịch |

## Sản phẩm và giao hàng

- Một danh mục chung gồm sản phẩm tự tạo và sản phẩm được chọn từ NCC.
- Sản phẩm tự tạo: admin nhập dữ liệu vào kho; hệ thống tự giao khi thanh toán được xác nhận.
- Không giữ kho cho đơn chưa thanh toán. Khách thanh toán thành công trước được ưu tiên giao trước; không giao cùng một đơn vị hàng cho hai khách.
- Sản phẩm NCC: thanh toán được xác nhận thì hệ thống tự mua NCC và giao dữ liệu nhận được cho khách.
- Đơn nhiều sản phẩm: giao ngay phần thành công, phần lỗi chuyển admin; khách xem trạng thái Giao một phần và chi tiết từng sản phẩm.

## Giá bán

- Cấu hình một tỷ lệ lợi nhuận % mặc định chung; từng sản phẩm được ghi đè bằng % riêng.
- Khi admin thêm/chỉnh sản phẩm, gợi ý giá bằng `giá nhập × (1 + tỷ lệ % / 100)`; admin được sửa thành giá khác.
- Khi NCC tăng giá, tăng giá bán cùng tỷ lệ: `giá bán mới = giá bán cũ × giá nhập mới / giá nhập cũ`. Áp dụng cả giá admin đã sửa tay.
- Ví dụ giá nhập 100.000đ → 110.000đ, giá bán 120.000đ → 132.000đ.
- Khi NCC giảm giá, giữ nguyên giá bán.
- Giá bán mới chỉ áp dụng cho đơn mới; không tự thu thêm tiền khách đã thanh toán.
- Nếu giá nhập mới khiến đơn đã thanh toán bị lỗ trước khi đặt mua, dừng mua và báo admin xử lý.

Quy tắc tự tăng cùng tỷ lệ là quyết định cuối cùng, thay thế phương án chỉ chờ admin sửa giá đã được thảo luận trước đó.

## Ngoại lệ và cảnh báo

| Trường hợp | Xử lý đã chốt |
| --- | --- |
| NCC timeout, chưa rõ kết quả mua | Chờ đối soát, báo admin, không tự đặt mua lại |
| NCC xác nhận thất bại hoặc hết hàng | Báo admin xử lý, không tự mua lại hoặc hoàn tiền |
| Kho tự tạo hết sau khi khách thanh toán | Báo admin xử lý, không tự hoàn tiền |
| Giá nhập mới khiến đơn đã thanh toán bị lỗ | Dừng mua, báo admin; không tự thu thêm tiền khách |

Cảnh báo xuất hiện trong admin và gửi Telegram đến tài khoản/nhóm quản trị được cấu hình. Việc xác nhận kênh cảnh báo là yêu cầu tính năng; không phải yêu cầu gửi tin nhắn thật trong giai đoạn thiết kế.

## Lựa chọn kỹ thuật triển khai

Các lựa chọn dưới đây được áp dụng theo bản thiết kế đã được yêu cầu triển khai:

- Giá tính tự động làm tròn lên đồng VND nguyên. Mức % mặc định do admin cấu hình.
- Không tính tỷ lệ tăng khi giá nhập cũ thiếu hoặc bằng 0; thiết lập mốc giá hợp lệ và báo admin nếu cần kiểm tra giá bán.
- Mỗi lần đồng bộ dùng mốc giá nhập đã ghi nhận, cập nhật giá và mốc so sánh cùng nhau, tránh tăng lặp khi chạy lại cùng kết quả NCC.
- Đồng bộ NCC giữ tên, mô tả, ảnh, danh mục và trạng thái hiển thị do admin cấu hình; chỉ cập nhật thông tin cung ứng và giá theo quy tắc trên.
- Đơn đã tạo nhưng chưa thanh toán cũng giữ giá đã chốt; khi thanh toán xong vẫn kiểm tra tồn kho và nguy cơ lỗ trước khi thực hiện.
- Giữ sản phẩm và lịch sử hiện có khi hợp nhất danh mục, ánh xạ ID giữa dữ liệu cũ và danh mục chung; không xóa dữ liệu cũ ngầm định.
- Tái sử dụng xác thực và phân quyền hiện có; hợp nhất giao diện không tự cấp thêm quyền cho tài khoản.
- Mua NCC, xuất kho và thông báo cần chống xử lý trùng khi webhook, tác vụ hoặc yêu cầu được gửi lại. Trường hợp kết quả mua không rõ phải giữ chờ đối soát.

## Trình tự triển khai sau khi chốt thiết kế

1. Kiểm tra ảnh hưởng của các API, schema, luồng thanh toán và các thành phần admin trước khi chỉnh sửa; chọn cách hợp nhất dữ liệu bảo toàn lịch sử.
2. Tạo danh mục dùng chung cho admin, trang sản phẩm và luồng đặt hàng; thêm liên kết nguồn NCC, cấu hình % và kho tự tạo.
3. Kết nối thanh toán được xác nhận với tự mua NCC/xuất kho, giao một phần và các trạng thái cần admin xử lý.
4. Thêm cảnh báo trong admin và Telegram qua cấu hình quản trị; bảo đảm lỗi gửi cảnh báo không tạo lại đơn mua hoặc giao lại hàng.
5. Tích hợp chức năng vào các mục admin đã chốt, bỏ iframe và giao diện MMO riêng; giữ các chức năng hiện có như quản lý khách, thanh toán ngân hàng, nội dung website và nhật ký quản trị.
6. Kiểm tra các luồng chính, cập nhật tài liệu vận hành và báo kết quả. Việc triển khai lên production và gửi cảnh báo thử thật không thuộc bước xác nhận thiết kế.

## Các tình huống cần kiểm chứng

- Trang sản phẩm hiển thị đúng danh mục admin, không gọi API Gum Tool.
- Admin quản lý được sản phẩm tự tạo và NCC trong giao diện chung.
- Thanh toán chưa thành công không mua NCC hoặc giao dữ liệu kho.
- Webhook lặp không mua hai lần hoặc xuất kho hai lần; hai khách không nhận cùng một tài khoản.
- Khách thanh toán thành công trước nhận hàng trước; khách thanh toán khi hết kho chuyển admin, không tự hoàn tiền.
- NCC tăng giá làm giá bán tăng đúng tỷ lệ, kể cả giá sửa tay; đồng bộ lặp không tăng giá lặp; NCC giảm giá giữ nguyên giá bán.
- Giá của đơn cũ không tự đổi hoặc bị thu thêm; nguy cơ lỗ trước khi mua được chuyển admin.
- Timeout không tự mua lại; lỗi/hết hàng báo admin; đơn có phần thành công được giao ngay phần đó.
- Cảnh báo có trong admin và được đưa vào luồng gửi Telegram; dữ liệu sản phẩm và lịch sử cũ giữ đúng liên kết.
