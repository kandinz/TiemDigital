# Thuật ngữ quản trị và sản phẩm

Tài liệu được bổ sung trong quá trình làm rõ yêu cầu hợp nhất admin ngày 2026-10-29.

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| Admin chung | Page quản trị của TiệmDigital, nơi các tính năng hiện có của MMO được tích hợp vào giao diện và điều hướng chung. Các nhóm chức năng đã chốt: Sản phẩm, Nhà cung cấp, Đơn hàng, Tổng quan / Tài chính; bỏ tab MMO và iframe riêng. |
| MMO | Tên nhóm tính năng hiện có về nhà cung cấp, nhập hàng, giao dịch, báo cáo, bảo hành và kệ bán lẻ; theo yêu cầu mới không phải một phân hệ hay tab riêng trong admin. |
| Nhà cung cấp (NCC) | Nguồn cung cấp sản phẩm mà quản trị viên có thể kết nối, xem hàng và đặt mua. |
| Sản phẩm tự tạo | Sản phẩm do quản trị viên trực tiếp khai báo để bán trong TiệmDigital, được nhập sẵn dữ liệu vào kho và tự giao sau khi thanh toán được xác nhận. |
| Sản phẩm từ nhà cung cấp | Sản phẩm được quản trị viên chọn từ một NCC để đưa vào danh mục bán của TiệmDigital. Sau khi khách thanh toán được xác nhận, hệ thống tự mua từ NCC và giao hàng cho khách. |
| Danh mục bán | Danh sách sản phẩm được cấu hình tại mục Sản phẩm trong admin để cung cấp cho trang sản phẩm. Hỗ trợ cả hai nguồn sản phẩm đã chốt. |
| Đơn khách | Đơn mua của khách trên TiệmDigital; cần phân biệt với đơn mà admin đặt mua tại NCC. |
| Đơn nhập hàng | Đơn đặt mua tại NCC. Với sản phẩm từ NCC, hệ thống tự tạo đơn nhập hàng để phục vụ đơn khách đã thanh toán. |
| Giao hàng | Cung cấp key, tài khoản hoặc dữ liệu sản phẩm cho khách sau khi thanh toán được xác nhận. Sản phẩm từ NCC được tự động mua và giao; sản phẩm tự tạo được tự giao từ kho. |
| Kho sản phẩm tự tạo | Nơi quản trị viên nhập sẵn key, tài khoản hoặc dữ liệu giao hàng để hệ thống xuất giao cho khách đã thanh toán. Không giữ hàng cho đơn chưa thanh toán; ưu tiên khách thanh toán thành công trước, không giao một đơn vị hàng cho hai khách. Nếu khách đã thanh toán nhưng kho hết thì báo admin xử lý, không tự hoàn tiền. |
| Tỷ lệ lợi nhuận % | Cấu hình phần trăm dùng để gợi ý/tự điền giá bán khi admin thêm hoặc chỉnh sản phẩm từ NCC theo công thức `giá nhập × (1 + tỷ lệ % / 100)`. Có một mức mặc định chung và cho phép từng sản phẩm ghi đè bằng mức % riêng. Phân biệt với tỷ lệ NCC tăng giá. |
| Tỷ lệ NCC tăng giá | Mức tăng tương đối của giá nhập so với giá nhập trước đó. Khi NCC tăng giá, giá bán tăng cùng tỷ lệ theo `giá bán cũ × (giá nhập mới / giá nhập cũ)`, kể cả giá admin sửa tay. Giá mới chỉ áp dụng cho đơn mới. Khi NCC giảm giá, giữ nguyên giá bán. |
| Giá bán tùy chỉnh | Giá bán do admin sửa lại thay cho giá tự điền theo tỷ lệ lợi nhuận %. Khi NCC tăng giá, giá này vẫn tự tăng cùng tỷ lệ NCC; khi NCC giảm giá, giữ nguyên giá bán. |
| Quy tắc chống bán lỗ | Nếu giá nhập NCC mới khiến đơn đã thanh toán bị lỗ trước khi đặt mua, dừng mua và báo admin xử lý. Không tự thu thêm tiền của khách. Giá danh mục mới chỉ áp dụng cho đơn mới. |
| Giao một phần | Đơn có một phần sản phẩm được giao thành công, phần lỗi chuyển admin xử lý. Khách được nhận ngay phần thành công và xem chi tiết từng sản phẩm. |
| Giá đã chốt của đơn | Giá của đơn được giữ theo nguyên tắc giá bán mới chỉ áp dụng cho đơn mới, gồm cả đơn cũ chưa thanh toán. Không tự thu thêm tiền của khách đã thanh toán theo giá cũ. |
| Chờ đối soát NCC | Trường hợp NCC timeout và chưa xác định được kết quả đặt mua. Giữ đơn chờ xác minh, báo admin và không tự đặt mua lại để tránh trùng đơn. |
| Đơn cần admin xử lý | Đơn mua từ NCC xác nhận thất bại/hết hàng, đơn phải dừng mua do giá nhập mới gây lỗ, hoặc đơn khách đã thanh toán nhưng kho tự tạo đã hết. Hệ thống lưu nguyên nhân và báo admin để quyết định cách xử lý. Không tự mua lại hoặc tự hoàn tiền. |
| Cảnh báo quản trị | Thông báo trong admin và gửi Telegram đến tài khoản/nhóm quản trị được cấu hình, dành cho đơn cần xử lý hoặc chờ đối soát. |

Quyết định liên quan: [Hợp nhất quản trị và danh mục](decisions/2026-10-29-unified-admin-catalog.md).
