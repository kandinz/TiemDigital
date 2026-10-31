# Chọn nền component React cho storefront + admin

Research cho ticket "Chọn nền component React cho storefront + admin" (#8) của map "Làm lại UI/UX storefront + admin" (#1). Bản rút gọn từ báo cáo của subagent research, ngày 2026-10-31.

> Độ tin cậy: ưu tiên tài liệu chính thức (ui.shadcn.com, radix-ui.com, base-ui.com, tanstack.com, mantine.dev, ant.design, refine.dev). Số liệu bundle size và một số version chỉ đến từ nguồn thứ cấp — **chưa xác minh**, cần đo/đối chiếu lại (`npm view <pkg> version`, `vite-bundle-visualizer`).

## Tiêu chí

Bảng dữ liệu dày + hành vi mobile; bundle storefront không bị admin kéo nặng; tuỳ biến thương hiệu với Tailwind; a11y; tiếng Việt/VNĐ; sức khoẻ bảo trì; React 19; Vite + Cloudflare Pages.

## So sánh

| Tiêu chí | A. shadcn/ui + TanStack Table | B. Mantine + mantine-react-table | C. Ant Design + ProTable | D. Refine (lớp phủ) |
|---|---|---|---|---|
| Mô hình | Sở hữu source component, primitive headless (Radix/Base UI) + Tailwind | Thư viện đầy đủ, engine CSS riêng | Thư viện "all-in-one", CSS-in-JS token | Framework data/routing/CRUD, headless UI |
| Bảng dày | Rất mạnh, headless, kiểm soát 100% markup, có virtualization | Tốt nhưng wrapper có rủi ro bảo trì | Mạnh nhất out-of-box (search form tự sinh, toolbar, export) | Hook `useTable` nối vào A/B/C |
| Bảng trên mobile | Tự thiết kế table → card, toàn quyền | Markup `<table>` cố định hơn | Mặc định cuộn ngang, cần override nặng | Phụ thuộc UI bên dưới |
| Ảnh hưởng bundle storefront | Thấp nhất | Trung bình–cao (provider/CSS toàn cục) | Cao nhất | Thêm 1 tầng trừu tượng |
| Tách chunk admin | Rất dễ (route lazy + `manualChunks`) | Khó sạch 100% | Khả thi nhưng cần kỷ luật | N/A |
| Tailwind | Native | Xung đột hệ style | Khó nhất | N/A |
| a11y | Rất tốt (Radix/Base UI theo WAI-ARIA) | Tốt | Tốt mức cơ bản | N/A |
| Tiếng Việt/VNĐ | Tự làm (`Intl.NumberFormat('vi-VN')` + i18next) | Tự làm | Có sẵn `antd/locale/vi_VN` | `@refinedev/i18n` |
| Bảo trì (cuối 2026) | Rất active; shadcn chuyển mặc định sang Base UI 7/2026 | **Rủi ro**: mantine-react-table được cho là không còn active cho Mantine v8/v9 (chưa xác minh) | AntD v6, hết cần patch React 19 | v5 hỗ trợ React 19 (version chưa xác minh) |
| React 19 | ✅ | Điểm nghẽn ở wrapper bảng | ✅ | ✅ |

Nguồn chính: [TanStack Table](https://tanstack.com/table/latest/docs/introduction), [shadcn changelog Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [Radix a11y](https://www.radix-ui.com/primitives/docs/overview/accessibility), [Base UI a11y](https://base-ui.com/react/overview/accessibility), [ProTable](https://procomponents.ant.design/en-US/components/table), [AntD i18n](https://ant.design/docs/react/i18n), [AntD v6 migration](https://ant.design/docs/react/migration-v6), [Refine docs](https://refine.dev/docs), [mantine-react-table-open](https://www.npmjs.com/package/mantine-react-table-open).

## Khuyến nghị

**shadcn/ui (Base UI, fallback Radix từng component) + TanStack Table + TanStack Query + Recharts + Tailwind v4**, tự viết lớp data/admin mỏng, không dùng Refine.

Lý do: tách bundle storefront/admin sạch nhất; Tailwind-native, dễ làm thương hiệu; a11y do primitive lo; rủi ro bảo trì thấp nhất.

Đánh đổi: không có ProTable "ra hàng nhanh" → tự xây một `DataTable<T>` generic dùng chung (sort/filter/pagination/bulk-select/saved filter/drawer); tự làm i18n/VNĐ (việc nhỏ).

**Stack cụ thể**

- UI: `shadcn/ui` (CLI `-b base`), Tailwind CSS v4, CSS variables cho sáng/tối.
- Bảng: `@tanstack/react-table` + `@tanstack/react-virtual` + `DataTable` tự viết.
- Data: `@tanstack/react-query` gọi API Workers.
- Routing: `react-router` v7, `React.lazy` cho `/admin/*`; `manualChunks` tách `admin` / `vendor-table` / `vendor-charts`.
- Chart: `recharts` trực tiếp (không qua Tremor).
- i18n: `i18next` + `react-i18next`, `Intl.NumberFormat`/`Intl.DateTimeFormat` `vi-VN`.
- Deploy: SPA build → Cloudflare Pages, `not_found_handling = "single-page-application"`.

**Phương án dự phòng**: Ant Design + ProTable chỉ cho `/admin` (lazy-load riêng, không import vào storefront) nếu không đủ thời gian tự xây `DataTable`.

## Rủi ro còn lại

1. Base UI còn non trẻ hơn Radix — pilot Combobox/Dialog lồng nhau trước khi cam kết.
2. Số liệu bundle size chưa đo trực tiếp — đo bằng `vite-bundle-visualizer` ngay ở prototype đầu.
3. Version AntD v6 / Mantine v8–v9 / Refine v5 cần đối chiếu npm trước khi khởi tạo.
4. Thông tin sunset 2027 của fork mantine-react-table chưa xác minh.
