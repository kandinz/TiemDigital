/**
 * Đặc tả OpenAPI 3.0 chuẩn cho hệ thống API Danh mục Sản phẩm & Bán lẻ MMO (/product)
 * - Mục đích: Cung cấp tài liệu Swagger UI và OpenAPI JSON tương tác trực quan cho khách hàng và lập trình viên.
 */
export const productOpenApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "TiệmDigital MMO Product & Retail Catalog API",
    version: "1.0.0",
    description:
      "Tài liệu Swagger API chính thức cho phân hệ Danh mục Sản phẩm & Kệ Bán lẻ MMO (TiệmDigital Product Catalog). Hỗ trợ tra cứu bảng giá sản phẩm bán lẻ công khai, lọc theo danh mục, tìm kiếm, cùng cụm API quản trị (Admin) để quản lý sản phẩm trên kệ, đồng bộ giá vốn từ các Vendor.",
    contact: {
      name: "TiệmDigital Support",
      url: "/admin/mmo",
    },
  },
  servers: [
    {
      url: "/api/admin",
      description: "Máy chủ API hiện tại",
    },
  ],
  tags: [
    {
      name: "Product Public",
      description: "Cụm API công khai phục vụ xem bảng giá, tìm kiếm và phân loại sản phẩm trên trang /product (Yêu cầu phiên Owner TiệmDigital)",
    },
    {
      name: "Retail Catalog Admin",
      description: "Cụm API quản trị kệ hàng bán lẻ dành cho Admin (Yêu cầu phiên Owner TiệmDigital)",
    },
    {
      name: "MMO Vendor & Ordering",
      description: "Cụm API tra cứu sản phẩm trực tiếp từ các nhà cung cấp (Vendor) và đặt mua tự động",
    },
  ],
  paths: {
    "/mmo/catalog": {
      get: {
        tags: ["Product Public"],
        summary: "Lấy danh mục sản phẩm bán lẻ công khai",
        description:
          "Cung cấp danh mục sản phẩm đang mở bán (`is_active = 1`) kèm giá bán lẻ VNĐ, hỗ trợ lọc theo danh mục hoặc từ khóa tìm kiếm. Thông tin giá vốn gốc của nhà cung cấp được ẩn hoàn toàn để bảo mật.",
        operationId: "getPublicCatalog",
        parameters: [
          {
            name: "category",
            in: "query",
            required: false,
            description: "Lọc theo tên danh mục sản phẩm (ví dụ: 'AI Tools', 'Giải trí', 'Học tập')",
            schema: {
              type: "string",
              example: "AI Tools",
            },
          },
          {
            name: "search",
            in: "query",
            required: false,
            description: "Từ khóa tìm kiếm theo tên hoặc nội dung mô tả",
            schema: {
              type: "string",
              example: "ChatGPT",
            },
          },
        ],
        responses: {
          200: {
            description: "Lấy danh mục thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PublicCatalogResponse",
                },
                example: {
                  success: true,
                  products: [
                    {
                      id: 1,
                      name: "ChatGPT Plus (Chính chủ 1 tháng)",
                      description: "Nâng cấp trực tiếp trên tài khoản email chính chủ. Truy cập GPT-4o, Canvas, DALL-E 3 không giới hạn.",
                      selling_price: 450000,
                      category: "AI Tools",
                      image_url: null,
                      in_stock: true,
                      updated_at: "2026-10-25T14:30:00.000Z",
                    },
                    {
                      id: 2,
                      name: "Netflix Premium 4K UltraHD (1 tháng)",
                      description: "Gói xem phim 4K UHD 1 profile riêng biệt có mã PIN bảo vệ, phụ đề Tiếng Việt đầy đủ.",
                      selling_price: 65000,
                      category: "Giải trí",
                      image_url: null,
                      in_stock: true,
                      updated_at: "2026-10-25T14:35:00.000Z",
                    },
                  ],
                  categories: ["AI Tools", "Giải trí", "Học tập", "Lập trình", "VPN & Proxy"],
                  total: 2,
                },
              },
            },
          },
          500: {
            description: "Lỗi máy chủ nội bộ",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Retail Catalog Admin"],
        summary: "Thêm hoặc lưu đè sản phẩm từ Vendor vào kệ bán lẻ",
        description: "Lưu sản phẩm được chọn từ Vendor vào bảng kệ bán lẻ `mmo_retail_products`. Tự động gán tên, mô tả gốc nếu chưa có tùy biến.",
        operationId: "addRetailProduct",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateRetailProductRequest",
              },
              example: {
                provider_id: "chodaumoi",
                provider_product_id: "cdm_prod_101",
                original_name: "ChatGPT Plus 1 Tháng",
                original_description: "Nâng cấp chính chủ email",
                original_price_usd: 16.5,
                original_price: 380000,
                original_currency: "VND",
                selling_price: 450000,
                name: "ChatGPT Plus (Chính chủ 1 tháng)",
                description: "Nâng cấp trực tiếp trên tài khoản email chính chủ. Bảo hành trọn gói.",
                category: "AI Tools",
                in_stock: 1,
                is_active: 1,
                sort_order: 1,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Thêm sản phẩm vào kệ bán lẻ thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BaseSuccessResponse",
                },
              },
            },
          },
          400: {
            description: "Dữ liệu đầu vào không hợp lệ",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          401: {
            description: "Chưa đăng nhập hoặc token không hợp lệ",
          },
          403: {
            description: "Yêu cầu quyền Admin",
          },
        },
      },
    },
    "/mmo/catalog/admin": {
      get: {
        tags: ["Retail Catalog Admin"],
        summary: "Lấy toàn bộ sản phẩm trên kệ bán lẻ dành cho Admin",
        description: "Trả về toàn bộ sản phẩm trên kệ bán lẻ (bao gồm cả sản phẩm ẩn), đối soát giá vốn vendor, tỷ lệ lợi nhuận (%) và nguồn cung cấp.",
        operationId: "getAdminCatalog",
        security: [{ SessionAuth: [] }],
        responses: {
          200: {
            description: "Lấy danh sách thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdminCatalogResponse",
                },
              },
            },
          },
          401: {
            description: "Chưa xác thực",
          },
          403: {
            description: "Yêu cầu quyền Admin",
          },
        },
      },
    },
    "/mmo/catalog/{id}": {
      put: {
        tags: ["Retail Catalog Admin"],
        summary: "Cập nhật thông tin sản phẩm bán lẻ",
        description: "Chỉnh sửa tên tùy biến, mô tả, giá bán lẻ, danh mục, thứ tự hiển thị hoặc khôi phục về mặc định ban đầu của Vendor.",
        operationId: "updateRetailProduct",
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "ID của sản phẩm trong bảng mmo_retail_products",
            schema: {
              type: "integer",
              example: 1,
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateRetailProductRequest",
              },
              example: {
                name: "ChatGPT Plus Pro 1 Tháng",
                description: "Bảo hành 30 ngày, đổi mới nếu lỗi.",
                selling_price: 460000,
                category: "AI Tools",
                is_active: 1,
                sort_order: 0,
                restore_defaults: false,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Cập nhật thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BaseSuccessResponse",
                },
              },
            },
          },
          404: {
            description: "Không tìm thấy sản phẩm",
          },
        },
      },
      delete: {
        tags: ["Retail Catalog Admin"],
        summary: "Xóa sản phẩm khỏi kệ bán lẻ",
        description: "Gỡ bỏ hoàn toàn sản phẩm khỏi bảng `mmo_retail_products`.",
        operationId: "deleteRetailProduct",
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "ID sản phẩm cần xóa",
            schema: {
              type: "integer",
              example: 1,
            },
          },
        ],
        responses: {
          200: {
            description: "Đã xóa sản phẩm thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BaseSuccessResponse",
                },
              },
            },
          },
          404: {
            description: "Không tìm thấy sản phẩm",
          },
        },
      },
    },
    "/mmo/catalog/{id}/status": {
      patch: {
        tags: ["Retail Catalog Admin"],
        summary: "Bật hoặc tắt trạng thái hiển thị của sản phẩm",
        description: "Ẩn hoặc hiện nhanh sản phẩm trên trang công khai `/product` mà không cần xóa dữ liệu.",
        operationId: "toggleRetailProductStatus",
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "ID sản phẩm cần chuyển đổi trạng thái",
            schema: {
              type: "integer",
              example: 1,
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  is_active: {
                    type: "boolean",
                    description: "Trạng thái hiển thị (true: Hiện, false: Ẩn)",
                    example: true,
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Cập nhật trạng thái thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Status updated successfully" },
                    is_active: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/mmo/catalog/sync": {
      post: {
        tags: ["Retail Catalog Admin"],
        summary: "Đồng bộ giá vốn & tồn kho hàng loạt từ các Vendor",
        description: "Gom nhóm theo từng nhà cung cấp (provider_id) và gửi request đến API vendor để cập nhật giá vốn gốc mới nhất và kiểm tra trạng thái còn hàng.",
        operationId: "syncRetailCatalog",
        security: [{ SessionAuth: [] }],
        responses: {
          200: {
            description: "Đồng bộ hoàn tất",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Synced 15 products across 3 providers" },
                    total_updated: { type: "integer", example: 15 },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/mmo/products": {
      get: {
        tags: ["MMO Vendor & Ordering"],
        summary: "Lấy danh mục sản phẩm trực tiếp từ Vendor",
        description: "Truy vấn thời gian thực danh sách sản phẩm và số dư ví của nhà cung cấp qua API hoặc Bot Telegram tương ứng.",
        operationId: "getVendorProducts",
        parameters: [
          {
            name: "provider_id",
            in: "query",
            required: true,
            description: "Mã định danh nhà cung cấp (ví dụ: `chodaumoi`, `aiverse`, `taphoabanlo`, `shopnguyenanh`, `kaigubai`, `digitalcore`, `pandoradigital`, `bite`, v.v.)",
            schema: {
              type: "string",
              example: "chodaumoi",
            },
          },
        ],
        responses: {
          200: {
            description: "Lấy sản phẩm vendor thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VendorProductsResponse",
                },
              },
            },
          },
        },
      },
    },
    "/mmo/order": {
      post: {
        tags: ["MMO Vendor & Ordering"],
        summary: "Tạo đơn đặt mua sản phẩm tự động qua Vendor",
        description: "Thực hiện lệnh mua tự động trên hệ thống nhà cung cấp thông qua API adapter, khấu trừ tiền ví và ghi nhận lịch sử đơn hàng.",
        operationId: "placeVendorOrder",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PlaceOrderRequest",
              },
              example: {
                provider_id: "chodaumoi",
                product_id: "prod_001",
                product_name: "ChatGPT Plus 1 Tháng",
                email: "customer@example.com",
                quantity: 1,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Đặt hàng thành công",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PlaceOrderResponse",
                },
              },
            },
          },
          400: {
            description: "Thông tin đặt hàng không hợp lệ hoặc thiếu số dư ví",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      SessionAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Dùng cookie phiên TiệmDigital của tài khoản Owner đang đăng nhập. Không nhập JWT Gum Tool.",
      },
    },
    schemas: {
      PublicProduct: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "ChatGPT Plus (Chính chủ 1 tháng)" },
          description: { type: "string", example: "Nâng cấp chính chủ email cá nhân..." },
          selling_price: { type: "number", example: 450000 },
          category: { type: "string", example: "AI Tools" },
          image_url: { type: "string", nullable: true, example: null },
          in_stock: { type: "boolean", example: true },
          updated_at: { type: "string", format: "date-time", example: "2026-10-25T14:30:00.000Z" },
        },
      },
      PublicCatalogResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          products: {
            type: "array",
            items: { $ref: "#/components/schemas/PublicProduct" },
          },
          categories: {
            type: "array",
            items: { type: "string" },
            example: ["AI Tools", "Giải trí", "Học tập"],
          },
          total: { type: "integer", example: 2 },
        },
      },
      AdminProduct: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          provider_id: { type: "string", example: "chodaumoi" },
          provider_product_id: { type: "string", example: "cdm_prod_101" },
          name: { type: "string", example: "ChatGPT Plus (Chính chủ 1 tháng)" },
          description: { type: "string", example: "Nâng cấp trực tiếp..." },
          original_name: { type: "string", example: "ChatGPT Plus 1 Tháng" },
          original_description: { type: "string", example: "Gốc vendor" },
          original_price_usd: { type: "number", example: 16.5 },
          original_price: { type: "number", example: 380000 },
          original_currency: { type: "string", example: "VND" },
          selling_price: { type: "number", example: 450000 },
          profit_vnd: { type: "number", example: 70000 },
          profit_margin: { type: "number", example: 18 },
          category: { type: "string", example: "AI Tools" },
          image_url: { type: "string", nullable: true, example: null },
          in_stock: { type: "boolean", example: true },
          is_active: { type: "boolean", example: true },
          sort_order: { type: "integer", example: 0 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      AdminCatalogResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          products: {
            type: "array",
            items: { $ref: "#/components/schemas/AdminProduct" },
          },
          total: { type: "integer", example: 1 },
        },
      },
      CreateRetailProductRequest: {
        type: "object",
        required: ["provider_id", "provider_product_id", "original_name", "selling_price"],
        properties: {
          provider_id: { type: "string", example: "chodaumoi" },
          provider_product_id: { type: "string", example: "cdm_prod_101" },
          original_name: { type: "string", example: "ChatGPT Plus 1 Tháng" },
          original_description: { type: "string", example: "Vendor desc" },
          original_price_usd: { type: "number", example: 16.5 },
          original_price: { type: "number", example: 380000 },
          original_currency: { type: "string", example: "VND" },
          selling_price: { type: "number", example: 450000 },
          name: { type: "string", example: "ChatGPT Plus (Chính chủ 1 tháng)" },
          description: { type: "string", example: "Tùy biến hiển thị" },
          category: { type: "string", example: "AI Tools" },
          image_url: { type: "string", nullable: true, example: null },
          in_stock: { type: "integer", example: 1 },
          is_active: { type: "integer", example: 1 },
          sort_order: { type: "integer", example: 0 },
        },
      },
      UpdateRetailProductRequest: {
        type: "object",
        properties: {
          name: { type: "string", example: "ChatGPT Plus Siêu Tốc" },
          description: { type: "string", example: "Mô tả mới" },
          selling_price: { type: "number", example: 460000 },
          category: { type: "string", example: "AI Tools" },
          is_active: { type: "integer", example: 1 },
          sort_order: { type: "integer", example: 0 },
          restore_defaults: { type: "boolean", example: false },
        },
      },
      VendorProductsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                provider_product_id: { type: "string", example: "p123" },
                name: { type: "string", example: "Netflix 1 Month" },
                price_usd: { type: "number", example: 2.5 },
                price_original: { type: "number", example: 2.5 },
                currency_original: { type: "string", example: "USD" },
                in_stock: { type: "boolean", example: true },
              },
            },
          },
          categories: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      PlaceOrderRequest: {
        type: "object",
        required: ["provider_id", "product_id"],
        properties: {
          provider_id: { type: "string", example: "chodaumoi" },
          product_id: { type: "string", example: "cdm_prod_101" },
          product_name: { type: "string", example: "ChatGPT Plus" },
          email: { type: "string", example: "user@example.com" },
          quantity: { type: "integer", example: 1 },
        },
      },
      PlaceOrderResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Order placed successfully" },
          order: {
            type: "object",
            properties: {
              id: { type: "string", example: "ord_20261025_001" },
              status: { type: "string", example: "completed" },
              total_cost_vnd: { type: "number", example: 380000 },
            },
          },
        },
      },
      BaseSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operation completed successfully" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Error message description" },
        },
      },
    },
  },
};
