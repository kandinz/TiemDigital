import { SmartTable } from "./SmartTable";
import type { VendorSelection } from "./VendorCatalog";
import { ProductDescriptionEditor } from "../ProductDescription";
import { useEffect, useRef, useState } from "react";
import { api, amountLabel, timeLabel } from "../../services/platform";

type Run = (task: () => Promise<void>) => Promise<void>;

interface Product {
  id?: number;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  selling_price: number;
  in_stock: boolean;
  active: number | boolean;
  source: "stock" | "provider";
  provider_id: string | null;
  provider_product_id: string | null;
  cost_vnd: number;
  markup_percent: number | null;
  available: number;
}

interface InventoryItem {
  id: string;
  fulfillment_id: string | null;
  supplier_order_id: string | null;
  created_at: number;
  value: string | null;
}

interface Provider {
  id: string;
  name: string;
  base_url: string;
  is_active: boolean;
  api_key_masked?: string;
  balance: number | null;
  balance_currency: string;
  auth_type?: string;
  auth_key_name?: string;
  bot_url?: string | null;
  sort_order?: number;
}

interface VendorProduct {
  provider_product_id: string;
  name: string;
  price_usd: number;
  in_stock: boolean;
  category?: string;
  extra?: { description?: string; image_url?: string };
}

interface CatalogConfig {
  markupPercent: number | null;
  telegramChatId: string;
}

const ADAPTER_IDS = [
  "storebat",
  "prodseller",
  "aitools",
  "shotix1shop",
  "tdsreseller",
  "daiphuc",
  "bite",
  "aiverse",
  "primedigital",
  "fatcatstore",
  "fishymarket",
  "taphoabanlo",
  "hylehubstore",
  "chodaumoi",
  "shopnguyenanh",
  "kaigubai",
  "digitalcore",
  "pandoradigital",
  "prastyaneki",
  "prastyaaneki",
];

const emptyProduct = (): Product => ({
  name: "",
  description: "",
  category: "Khác",
  image_url: "",
  selling_price: 0,
  in_stock: true,
  active: true,
  source: "stock",
  provider_id: null,
  provider_product_id: null,
  cost_vnd: 0,
  markup_percent: null,
  available: 0,
});

const supplierApi = "/api/admin/mmo";

const reasonLabel = (reason: string) =>
  ({
    STOCK_EXHAUSTED: "Kho đã hết hàng",
    NCC_OUT_OF_STOCK: "NCC hết hàng",
    NCC_RESULT_UNCERTAIN: "Chưa rõ kết quả mua NCC",
    RESULT_UNCERTAIN: "Tác vụ cần đối soát",
    COST_EXCEEDS_PAID_PRICE: "Giá nhập vượt giá khách đã trả",
    NCC_PURCHASE_FAILED: "NCC báo mua thất bại",
    NCC_AWAITING_DELIVERY: "Đã mua NCC, chờ giao",
    NCC_PARTIAL_DELIVERY: "NCC giao chưa đủ",
    STOCK_DELIVERY_REVIEW: "Cần kiểm tra xuất kho",
    PROVIDER_INACTIVE: "NCC đã tắt",
    SOURCE_MISSING: "Thiếu liên kết NCC",
    NCC_LEDGER_REVIEW: "Cần đối chiếu sổ nhập NCC",
  })[reason] ?? reason;

/**
 * Cuộn mượt tới khu vực form/chi tiết và tự động focus ô nhập liệu đầu tiên.
 */
function focusPanel(element: HTMLElement | null) {
  if (!element) return;
  requestAnimationFrame(() => {
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const firstInput = element.querySelector<HTMLElement>(
      "input:not([disabled]):not([type='hidden']):not([type='checkbox']), select:not([disabled]), textarea:not([disabled])",
    );
    firstInput?.focus({ preventScroll: true });
  });
}

/**
 * Hiển thị danh mục sản phẩm ở chế độ chỉ đọc cho quản trị viên hỗ trợ/kiểm toán.
 */
export function ReadOnlyProducts({ run }: { run: Run }) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    void run(async () =>
      setProducts(
        (await api<{ products: Product[] }>("/api/admin/products")).products,
      ),
    );
  }, [run]);
  return (
    <section className="panel">
      <h2>Danh mục sản phẩm</h2>
      <div className="table-wrap">
        <SmartTable>
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Danh mục</th>
              <th>Giá bán</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>
                  <span className="status neutral">{p.category}</span>
                </td>
                <td>
                  <strong>{amountLabel(p.selling_price)}</strong>
                </td>
                <td>
                  <span className={p.active ? "status good" : "status"}>
                    {p.active ? "Hiển thị" : "Ẩn"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </SmartTable>
      </div>
    </section>
  );
}

/**
 * Quản trị danh mục sản phẩm, kho tự tạo và liên kết sản phẩm từ nhà cung cấp.
 */
export function CatalogProducts({ run }: { run: Run }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product>(emptyProduct);
  const [config, setConfig] = useState<CatalogConfig>({
    markupPercent: null,
    telegramChatId: "",
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [usdRate, setUsdRate] = useState(25500);
  const [providerId, setProviderId] = useState("");
  const [filter, setFilter] = useState("");
  const [inventory, setInventory] = useState("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemValue, setEditingItemValue] = useState("");
  const [syncErrors, setSyncErrors] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const editorRef = useRef<HTMLElement | null>(null);

  async function loadInventory(productId: number) {
    const res = await api<{
      items?: InventoryItem[];
      inventory?: InventoryItem[];
    }>(`/api/admin/products/${productId}/inventory`);
    setInventoryItems(res.items ?? res.inventory ?? []);
  }

  async function load() {
    const [catalog, settings, directory] = await Promise.all([
      api<{ products: Product[] }>("/api/admin/products"),
      api<CatalogConfig>("/api/admin/catalog-config"),
      api<{ providers: Provider[]; usd_rate: number }>(
        `${supplierApi}/providers`,
      ),
    ]);
    setProducts(catalog.products);
    setConfig(settings);
    setProviders(directory.providers);
    setUsdRate(directory.usd_rate);
  }

  useEffect(() => {
    void run(load);
  }, [run]);

  useEffect(() => {
    if (product.id && product.source === "stock") {
      void loadInventory(product.id).catch(() => setInventoryItems([]));
    } else {
      setInventoryItems([]);
      setEditingItemId(null);
      setEditingItemValue("");
    }
  }, [product.id, product.source]);

  const suggestedPrice = (p: Product) =>
    Math.ceil(
      p.cost_vnd * (1 + (p.markup_percent ?? config.markupPercent ?? 0) / 100),
    );

  const activeCount = products.filter((p) => Boolean(p.active)).length;
  const stockSourceCount = products.filter((p) => p.source === "stock").length;
  const providerSourceCount = products.filter(
    (p) => p.source === "provider",
  ).length;

  return (
    <div className="admin-split-grid">
      <div>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Danh mục bán</h2>
              <p className="muted">
                Bấm vào dòng sản phẩm để chỉnh sửa, nhập key kho hoặc ngừng bán.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setProduct(emptyProduct());
                setInventory("");
                setEditorOpen(true);
                focusPanel(editorRef.current);
              }}
            >
              Thêm sản phẩm tự tạo
            </button>
          </div>
          <div className="admin-kv-grid">
            <div className="admin-kv-item">
              <small>Tổng sản phẩm</small>
              <strong>{products.length}</strong>
            </div>
            <div className="admin-kv-item">
              <small>Đang hiển thị</small>
              <strong>{activeCount}</strong>
            </div>
            <div className="admin-kv-item">
              <small>Kho tự tạo</small>
              <strong>{stockSourceCount}</strong>
            </div>
            <div className="admin-kv-item">
              <small>Liên kết NCC</small>
              <strong>{providerSourceCount}</strong>
            </div>
          </div>
          <div className="admin-toolbar">
            <input
              aria-label="Tìm sản phẩm quản trị"
              placeholder="Tìm theo tên hoặc danh mục…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              onClick={() =>
                void run(async () => {
                  const result = await api<{
                    errors: { providerId: string; error: string }[];
                  }>("/api/admin/products/sync", { body: {} });
                  setSyncErrors(
                    result.errors
                      .map((v) => `${v.providerId}: ${v.error}`)
                      .join("\n"),
                  );
                  await load();
                })
              }
            >
              Đồng bộ giá nhập & tồn NCC
            </button>
          </div>
          {syncErrors && (
            <p role="alert" className="notice error">
              {syncErrors}
            </p>
          )}
          <div className="table-wrap">
            <SmartTable>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Nguồn</th>
                  <th>Giá nhập</th>
                  <th>Giá bán</th>
                  <th>Kho / hiển thị</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter((p) =>
                    `${p.name} ${p.category}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .map((p) => (
                    <tr
                      key={p.id}
                      className={`clickable-row ${product.id === p.id ? "selected-row" : ""}`}
                      onClick={() => {
                        setProduct(p);
                        setInventory("");
                        setEditorOpen(true);
                        focusPanel(editorRef.current);
                      }}
                    >
                      <td>
                        <strong>{p.name}</strong>
                        <br />
                        <small className="muted">
                          {p.category} · #{p.id}
                        </small>
                      </td>
                      <td>
                        <span className="status neutral">
                          {p.source === "stock" ? "Kho tự tạo" : p.provider_id}
                        </span>
                      </td>
                      <td>
                        {p.source === "provider"
                          ? amountLabel(p.cost_vnd)
                          : "—"}
                      </td>
                      <td>
                        <strong>{amountLabel(p.selling_price)}</strong>
                      </td>
                      <td>
                        <span
                          className={
                            p.source === "stock"
                              ? p.available > 0
                                ? "status good"
                                : "status"
                              : p.in_stock
                                ? "status good"
                                : "status"
                          }
                        >
                          {p.source === "stock"
                            ? `${p.available} có sẵn`
                            : p.in_stock
                              ? "Còn hàng"
                              : "Hết hàng"}
                        </span>{" "}
                        <span className="status neutral">
                          {p.active ? "Hiện" : "Ẩn"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </SmartTable>
          </div>
          {!products.length && (
            <p className="muted">
              Chưa có sản phẩm. Thêm sản phẩm tự tạo hoặc chọn từ NCC bên dưới.
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Chọn sản phẩm từ nhà cung cấp</h2>
          <p className="muted">
            Tải bảng giá trực tiếp từ nhà cung cấp và bấm vào dòng sản phẩm để
            liên kết mở bán trên cửa hàng.
          </p>
          <div className="admin-toolbar">
            <select
              aria-label="Chọn nhà cung cấp"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setVendorProducts([]);
              }}
            >
              <option value="">Chọn NCC…</option>
              {providers
                .filter((p) => p.is_active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button
              className="primary"
              disabled={!providerId}
              onClick={() =>
                void run(async () => {
                  const data = await api<{
                    products: VendorProduct[];
                    usd_rate: number;
                  }>(
                    `${supplierApi}/products?provider_id=${encodeURIComponent(providerId)}`,
                  );
                  setVendorProducts(data.products);
                  setUsdRate(data.usd_rate);
                })
              }
            >
              Tải danh mục NCC
            </button>
          </div>
          {!!vendorProducts.length && (
            <div className="table-wrap">
              <SmartTable>
                <thead>
                  <tr>
                    <th>Sản phẩm NCC</th>
                    <th>Giá nhập VND</th>
                    <th>Trạng thái</th>
                    <th>Danh mục bán</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorProducts.map((v) => {
                    const alreadyLinked = products.some(
                      (p) =>
                        p.provider_id === providerId &&
                        p.provider_product_id === v.provider_product_id,
                    );
                    return (
                      <tr
                        key={v.provider_product_id}
                        className="clickable-row"
                        onClick={() => {
                          const existing = products.find(
                            (p) =>
                              p.provider_id === providerId &&
                              p.provider_product_id === v.provider_product_id,
                          );
                          const p = existing ?? {
                            ...emptyProduct(),
                            source: "provider" as const,
                            provider_id: providerId,
                            provider_product_id: v.provider_product_id,
                            name: v.name,
                            description: v.extra?.description ?? "",
                            category: v.category || "Khác",
                            image_url: v.extra?.image_url ?? "",
                            cost_vnd: Math.ceil(v.price_usd * usdRate),
                            in_stock: v.in_stock,
                          };
                          setProduct(
                            existing ?? {
                              ...p,
                              selling_price:
                                config.markupPercent === null
                                  ? Math.max(1000, p.cost_vnd)
                                  : suggestedPrice(p),
                            },
                          );
                          setEditorOpen(true);
                          focusPanel(editorRef.current);
                        }}
                      >
                        <td>
                          <strong>{v.name}</strong>
                        </td>
                        <td>{amountLabel(Math.ceil(v.price_usd * usdRate))}</td>
                        <td>
                          <span
                            className={v.in_stock ? "status good" : "status"}
                          >
                            {v.in_stock ? "Còn hàng" : "Hết hàng"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              alreadyLinked ? "status good" : "status neutral"
                            }
                          >
                            {alreadyLinked ? "Đã liên kết" : "Chưa thêm"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </SmartTable>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Giá bán mặc định</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api("/api/admin/catalog-config", {
                  method: "PUT",
                  body: config,
                });
                await load();
              });
            }}
          >
            <label>
              % lợi nhuận mặc định
              <input
                type="number"
                min={0}
                max={10000}
                step="0.01"
                value={config.markupPercent ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    markupPercent:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <p className="muted">
              Giá gợi ý = giá nhập × (1 + %). NCC tăng giá thì giá bán tăng cùng
              tỷ lệ, kể cả giá sửa tay. NCC giảm giá thì giữ nguyên giá bán. Giá
              mới chỉ áp dụng cho đơn mới.
            </p>
            <button>Lưu cấu hình giá</button>
          </form>
        </section>
      </div>

      <aside
        className={`admin-sticky-pane admin-detail-pane ${editorOpen ? "is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setEditorOpen(false);
        }}
      >
        <section className="panel panel-focus-target" ref={editorRef}>
          <div className="panel-heading">
            <h2>
              {product.id
                ? `Chỉnh sản phẩm #${product.id}`
                : product.source === "provider"
                  ? "Thêm sản phẩm từ NCC"
                  : "Thêm sản phẩm tự tạo"}
            </h2>
            <div className="action-row">
              {product.id && (
                <>
                  {product.active ? (
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await api(`/api/admin/products/${product.id}`, {
                            method: "DELETE",
                          });
                          setProduct(emptyProduct());
                          setEditorOpen(false);
                          await load();
                        })
                      }
                    >
                      Ngừng bán
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/api/admin/products/${product.id}/status`,
                              {
                                method: "PATCH",
                                body: { active: true },
                              },
                            );
                            setProduct({ ...product, active: true });
                            await load();
                          })
                        }
                      >
                        Bật bán lại
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void run(async () => {
                            if (!window.confirm(`Xóa hẳn sản phẩm "${product.name}" (#${product.id})? Thao tác này không thể hoàn tác. Để chỉ ẩn sản phẩm, hãy hủy và giữ trạng thái ngừng bán.`)) return;
                            await api(
                              `/api/admin/products/${product.id}?permanent=1`,
                              { method: "DELETE" },
                            );
                            setProduct(emptyProduct());
                            setEditorOpen(false);
                            await load();
                          })
                        }
                      >
                        Xóa hẳn
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProduct(emptyProduct());
                      setInventory("");
                    }}
                  >
                    Tạo sản phẩm mới
                  </button>
                </>
              )}
              <button
                type="button"
                className="admin-mobile-only"
                onClick={() => setEditorOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const saved = await api<{ id: number }>("/api/admin/products", {
                  body: {
                    ...product,
                    active: Boolean(product.active),
                    provider_id:
                      product.source === "provider"
                        ? (product.provider_id ?? undefined)
                        : undefined,
                    provider_product_id:
                      product.source === "provider"
                        ? (product.provider_product_id ?? undefined)
                        : undefined,
                  },
                });
                await load();
                setProduct((p) => ({ ...p, id: saved.id }));
              });
            }}
          >
            <div className="form-grid">
              <label>
                Tên sản phẩm
                <input
                  required
                  maxLength={150}
                  value={product.name}
                  onChange={(e) =>
                    setProduct({ ...product, name: e.target.value })
                  }
                />
              </label>
              <label>
                Danh mục
                <input
                  required
                  value={product.category}
                  onChange={(e) =>
                    setProduct({ ...product, category: e.target.value })
                  }
                />
              </label>
              <label>
                Nguồn cung ứng
                <select
                  value={product.source}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      source: e.target.value as "stock" | "provider",
                    })
                  }
                >
                  <option value="stock">Kho tự tạo</option>
                  <option value="provider">Nhà cung cấp (API)</option>
                </select>
              </label>
              <label>
                Ảnh HTTPS
                <input
                  type="url"
                  value={product.image_url ?? ""}
                  onChange={(e) =>
                    setProduct({ ...product, image_url: e.target.value })
                  }
                />
              </label>
              <label>
                Giá bán VND
                <input
                  required
                  type="number"
                  min={1}
                  max={100000000}
                  step={1}
                  value={product.selling_price || ""}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      selling_price: Number(e.target.value),
                    })
                  }
                />
              </label>
              {product.source === "provider" && (
                <>
                  <label>
                    Mã NCC liên kết
                    <select
                      required
                      value={product.provider_id ?? ""}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          provider_id: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Chọn NCC…</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mã sản phẩm phía NCC
                    <input
                      required
                      value={product.provider_product_id ?? ""}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          provider_product_id: e.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label>
                    % riêng (trống = mặc định{" "}
                    {config.markupPercent ?? "chưa cấu hình"}%)
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step="0.01"
                      value={product.markup_percent ?? ""}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          markup_percent:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <div>
                    <p>Giá nhập: {amountLabel(product.cost_vnd)}</p>
                    <button
                      type="button"
                      disabled={
                        product.markup_percent === null &&
                        config.markupPercent === null
                      }
                      onClick={() =>
                        setProduct({
                          ...product,
                          selling_price: suggestedPrice(product),
                        })
                      }
                    >
                      Tự điền giá theo %
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="description-field">
              <span>Mô tả</span>
              <ProductDescriptionEditor value={product.description} onChange={(description) => setProduct({ ...product, description })} />
            </div>
            <div className="action-row" style={{ marginBottom: 14 }}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(product.active)}
                  onChange={(e) =>
                    setProduct({ ...product, active: e.target.checked })
                  }
                />{" "}
                Hiển thị trên cửa hàng
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={product.in_stock}
                  onChange={(e) =>
                    setProduct({ ...product, in_stock: e.target.checked })
                  }
                />{" "}
                Cho phép bán
              </label>
            </div>
            <button className="primary">Lưu sản phẩm</button>
          </form>

          {product.source === "stock" && product.id && (
            <div className="admin-detail">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const pid = product.id!;
                    await api(`/api/admin/products/${pid}/inventory`, {
                      body: {
                        values: inventory
                          .split("\n")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      },
                    });
                    setInventory("");
                    await Promise.all([load(), loadInventory(pid)]);
                  });
                }}
              >
                <h3>Nhập kho key / tài khoản</h3>
                <p className="muted">
                  Mỗi dòng là một đơn vị hàng. Dữ liệu được mã hóa; chỉ giao khi
                  thanh toán thành công. Không giữ kho cho đơn chưa thanh toán.
                </p>
                <label>
                  Dữ liệu nhập kho
                  <textarea
                    required
                    value={inventory}
                    onChange={(e) => setInventory(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button className="primary">Nhập vào kho</button>
              </form>
              <div style={{ marginTop: 18 }}>
                <h3>
                  Danh sách key trong kho (
                  {inventoryItems.filter((i) => !i.fulfillment_id).length} có
                  sẵn / {inventoryItems.length} tổng)
                </h3>
                {!inventoryItems.length ? (
                  <p className="muted">
                    Chưa có dữ liệu trong kho sản phẩm này.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <SmartTable>
                      <thead>
                        <tr>
                          <th>Key / Tài khoản</th>
                          <th>Nguồn nhập</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryItems.map((item) => (
                          <tr
                            key={item.id}
                            className={
                              !item.fulfillment_id && editingItemId !== item.id
                                ? "clickable-row"
                                : editingItemId === item.id
                                  ? "selected-row"
                                  : ""
                            }
                            onClick={() => {
                              if (
                                !item.fulfillment_id &&
                                editingItemId !== item.id
                              ) {
                                setEditingItemId(item.id);
                                setEditingItemValue(item.value ?? "");
                              }
                            }}
                          >
                            <td className="mono">
                              {editingItemId === item.id ? (
                                <div
                                  className="stack"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    aria-label="Sửa dữ liệu kho"
                                    value={editingItemValue}
                                    onChange={(e) =>
                                      setEditingItemValue(e.target.value)
                                    }
                                  />
                                  <div className="action-row">
                                    <button
                                      type="button"
                                      className="primary"
                                      onClick={() =>
                                        void run(async () => {
                                          const pid = product.id!;
                                          await api(
                                            `/api/admin/products/${pid}/inventory/${encodeURIComponent(item.id)}`,
                                            {
                                              method: "PUT",
                                              body: {
                                                value: editingItemValue,
                                              },
                                            },
                                          );
                                          setEditingItemId(null);
                                          setEditingItemValue("");
                                          await loadInventory(pid);
                                        })
                                      }
                                    >
                                      Lưu key
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void run(async () => {
                                          const pid = product.id!;
                                          await api(
                                            `/api/admin/products/${pid}/inventory/${encodeURIComponent(item.id)}`,
                                            { method: "DELETE" },
                                          );
                                          setEditingItemId(null);
                                          setEditingItemValue("");
                                          await Promise.all([
                                            load(),
                                            loadInventory(pid),
                                          ]);
                                        })
                                      }
                                    >
                                      Xóa key
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingItemId(null);
                                        setEditingItemValue("");
                                      }}
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                (item.value ?? "(Đã mã hóa)")
                              )}
                            </td>
                            <td>
                              {item.supplier_order_id
                                ? `Đơn NCC: ${item.supplier_order_id}`
                                : "Nhập tay"}
                              <br />
                              <small className="muted">
                                {timeLabel(item.created_at)}
                              </small>
                            </td>
                            <td>
                              <span
                                className={
                                  item.fulfillment_id ? "status" : "status good"
                                }
                              >
                                {item.fulfillment_id
                                  ? `Đã giao (${item.fulfillment_id})`
                                  : "Chưa giao"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </SmartTable>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

/**
 * Quản trị kết nối nhà cung cấp MMO, tỷ giá USD, phân loại tự động và cảnh báo Telegram.
 */
export function Providers({ run }: { run: Run }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState({
    id: "prodseller",
    name: "",
    base_url: "",
    api_key: "",
    auth_type: "header",
    auth_key_name: "Authorization",
    bot_url: "",
    sort_order: 99,
    is_active: true,
  });
  const [rate, setRate] = useState(25500);
  const [categories, setCategories] = useState("");
  const [notice, setNotice] = useState("");
  const editorRef = useRef<HTMLElement | null>(null);

  async function load() {
    const [directory, settings] = await Promise.all([
      api<{ providers: Provider[]; usd_rate: number }>(
        `${supplierApi}/providers`,
      ),
      api<{ settings: { categories: { name: string; keywords: string[] }[] } }>(
        `${supplierApi}/settings`,
      ),
    ]);
    setProviders(directory.providers);
    setRate(directory.usd_rate);
    setCategories(
      settings.settings.categories
        .map((c) => `${c.name}: ${c.keywords.join(",")}`)
        .join("\n"),
    );
  }

  useEffect(() => {
    void run(load);
  }, [run]);

  return (
    <div className="admin-split-grid">
      <div>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Nhà cung cấp</h2>
              <p className="muted">
                Bấm vào dòng nhà cung cấp để chỉnh kết nối, cập nhật số dư hoặc
                xóa kết nối.
              </p>
            </div>
            <div className="action-row">
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const res = await api<{ updated: number; total: number }>(
                      `${supplierApi}/providers/sync-telegram`,
                      { body: {} },
                    );
                    setNotice(
                      `Đã đồng bộ Telegram cho ${res.updated}/${res.total} nhà cung cấp.`,
                    );
                    await load();
                  })
                }
              >
                Đồng bộ Telegram
              </button>
              <button
                className="primary"
                onClick={() => {
                  const unusedAdapter =
                    ADAPTER_IDS.find(
                      (id) => !providers.some((p) => p.id === id),
                    ) ?? "prodseller";
                  setEditing(false);
                  setEditorOpen(true);
                  setForm({
                    id: unusedAdapter,
                    name: "",
                    base_url: "",
                    api_key: "",
                    auth_type: "header",
                    auth_key_name: "Authorization",
                    bot_url: "",
                    sort_order: 99,
                    is_active: true,
                  });
                  focusPanel(editorRef.current);
                }}
              >
                Thêm kết nối
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <SmartTable>
              <thead>
                <tr>
                  <th>NCC</th>
                  <th>API key</th>
                  <th>Số dư</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr
                    key={p.id}
                    className={`clickable-row ${
                      editing && form.id === p.id ? "selected-row" : ""
                    }`}
                    onClick={() => {
                      setEditing(true);
                      setEditorOpen(true);
                      setForm({
                        id: p.id,
                        name: p.name,
                        base_url: p.base_url,
                        api_key: "",
                        auth_type: p.auth_type || "header",
                        auth_key_name: p.auth_key_name || "Authorization",
                        bot_url: p.bot_url || "",
                        sort_order: p.sort_order ?? 99,
                        is_active: p.is_active,
                      });
                      focusPanel(editorRef.current);
                    }}
                  >
                    <td>
                      <strong>{p.name}</strong>
                      <br />
                      <small className="muted">{p.id}</small>
                    </td>
                    <td className="mono">
                      {p.api_key_masked || "Chưa cấu hình"}
                    </td>
                    <td>
                      <strong>
                        {p.balance ?? "—"} {p.balance_currency}
                      </strong>
                    </td>
                    <td>
                      <span className={p.is_active ? "status good" : "status"}>
                        {p.is_active ? "Đang bật" : "Đã tắt"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SmartTable>
          </div>
          {notice && (
            <p role="status" className="notice" style={{ marginTop: 12 }}>
              {notice}
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Tỷ giá & phân loại NCC</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const parsed = categories
                  .split("\n")
                  .filter((v) => v.trim())
                  .map((line) => {
                    const [name, ...words] = line.split(":");
                    return {
                      name: name.trim(),
                      keywords: words
                        .join(":")
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    };
                  });
                await api(`${supplierApi}/settings`, {
                  method: "PUT",
                  body: { usd_rate: rate, categories: parsed },
                });
                await load();
              });
            }}
          >
            <label>
              Tỷ giá USD → VND
              <input
                type="number"
                required
                min={1}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </label>
            <label>
              Phân loại (mỗi dòng: Tên: từ khóa, từ khóa)
              <textarea
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
              />
            </label>
            <button>Lưu tỷ giá & phân loại</button>
          </form>
        </section>

      </div>

      <aside
        className={`admin-sticky-pane admin-detail-pane ${editorOpen ? "is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setEditorOpen(false);
        }}
      >
        <section className="panel panel-focus-target" ref={editorRef}>
          <div className="panel-heading">
            <h2>{editing ? "Chỉnh kết nối NCC" : "Thêm kết nối NCC"}</h2>
            <div className="action-row">
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{
                          balance: number;
                          currency: string;
                        }>(
                          `${supplierApi}/providers/${encodeURIComponent(form.id)}/sync-balance`,
                          { body: {} },
                        );
                        setNotice(
                          `${form.name || form.id}: ${result.balance} ${result.currency}`,
                        );
                        await load();
                      })
                    }
                  >
                    Cập nhật số dư
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `${supplierApi}/providers/${encodeURIComponent(form.id)}`,
                          { method: "DELETE" },
                        );
                        setEditing(false);
                        setEditorOpen(false);
                        setNotice(`Đã xóa kết nối ${form.name || form.id}.`);
                        await load();
                      })
                    }
                  >
                    Xóa kết nối
                  </button>
                </>
              )}
              <button
                type="button"
                className="admin-mobile-only"
                onClick={() => setEditorOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { api_key, ...rest } = form;
                await api(
                  `${supplierApi}/providers${editing ? `/${encodeURIComponent(form.id)}` : ""}`,
                  {
                    method: editing ? "PUT" : "POST",
                    body: { ...rest, ...(api_key ? { api_key } : {}) },
                  },
                );
                setForm({ ...form, api_key: "" });
                setEditing(true);
                await load();
              });
            }}
          >
            <div className="form-grid">
              <label>
                Adapter
                <select
                  disabled={editing}
                  value={form.id}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const existing = providers.find((p) => p.id === nextId);
                    if (existing) {
                      setForm({
                        id: existing.id,
                        name: existing.name,
                        base_url: existing.base_url,
                        api_key: "",
                        auth_type: existing.auth_type || "header",
                        auth_key_name:
                          existing.auth_key_name || "Authorization",
                        bot_url: existing.bot_url || "",
                        sort_order: existing.sort_order ?? 99,
                        is_active: existing.is_active,
                      });
                    } else {
                      setForm({ ...form, id: nextId });
                    }
                  }}
                >
                  {ADAPTER_IDS.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
              </label>
              <label>
                Tên NCC
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Địa chỉ API
                <input
                  required
                  type="url"
                  value={form.base_url}
                  onChange={(e) =>
                    setForm({ ...form, base_url: e.target.value })
                  }
                />
              </label>
              <label>
                API key {editing && "(để trống để giữ nguyên)"}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.api_key}
                  onChange={(e) =>
                    setForm({ ...form, api_key: e.target.value })
                  }
                />
              </label>
              <label>
                Kiểu xác thực
                <select
                  value={form.auth_type}
                  onChange={(e) =>
                    setForm({ ...form, auth_type: e.target.value })
                  }
                >
                  <option value="header">Header</option>
                  <option value="query">Query</option>
                </select>
              </label>
              <label>
                Tên header / tham số
                <input
                  required
                  value={form.auth_key_name}
                  onChange={(e) =>
                    setForm({ ...form, auth_key_name: e.target.value })
                  }
                />
              </label>
              <label>
                Telegram Bot / liên hệ (t.me/...)
                <input
                  value={form.bot_url}
                  placeholder="https://t.me/ten_bot"
                  onChange={(e) =>
                    setForm({ ...form, bot_url: e.target.value })
                  }
                />
              </label>
              <label>
                Thứ tự hiển thị
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sort_order: Number(e.target.value) || 99,
                    })
                  }
                />
              </label>
            </div>
            <div className="action-row" style={{ marginBottom: 14 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                />{" "}
                Bật nhà cung cấp
              </label>
              {form.bot_url && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const res = await api<{
                        data: { name?: string; avatar_url?: string } | null;
                      }>(`${supplierApi}/providers/extract-telegram`, {
                        body: { bot_url: form.bot_url },
                      });
                      if (res.data?.name) {
                        setForm((prev) => ({
                          ...prev,
                          name: res.data?.name || prev.name,
                        }));
                        setNotice(`Đã lấy tên từ Telegram: ${res.data.name}`);
                      }
                    })
                  }
                >
                  Lấy tên từ Telegram
                </button>
              )}
            </div>
            <button className="primary">Lưu kết nối</button>
          </form>
        </section>
      </aside>
    </div>
  );
}

interface Alert {
  id: string;
  order_id: string;
  fulfillment_id: string;
  reason: string;
  name: string;
  status: string;
  quantity: number;
  delivered_quantity: number;
  created_at: number;
  purchase_order_id: string | null;
  attempts: number;
}

/**
 * Hiển thị và xử lý các cảnh báo giao hàng / đối soát đơn hàng.
 */
export function FulfillmentAlerts({
  run,
  canResolve,
}: {
  run: Run;
  canResolve: boolean;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [values, setValues] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const resolveRef = useRef<HTMLFormElement | null>(null);

  async function load() {
    setAlerts(
      (await api<{ alerts: Alert[] }>("/api/admin/fulfillment-alerts")).alerts,
    );
  }

  useEffect(() => {
    void run(load);
  }, [run]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Cần xử lý & đối soát ({alerts.length})</h2>
          <p className="muted">
            Các đơn gặp sự cố tồn kho hoặc cần xác nhận kết quả mua từ NCC trước
            khi giao tiếp.
          </p>
        </div>
        <button onClick={() => void run(load)}>Cập nhật cảnh báo</button>
      </div>
      {!alerts.length ? (
        <p className="muted">Không có đơn cần xử lý.</p>
      ) : (
        <div className="table-wrap">
          <SmartTable>
            <thead>
              <tr>
                <th>Đơn / sản phẩm</th>
                <th>Nguyên nhân</th>
                <th>Đã giao</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.id}
                  className={`${canResolve ? "clickable-row" : ""} ${
                    selected?.id === a.id ? "selected-row" : ""
                  }`}
                  onClick={() => {
                    if (!canResolve) return;
                    setSelected(a);
                    setValues("");
                    setReason("");
                    setConfirmed(false);
                    focusPanel(resolveRef.current);
                  }}
                >
                  <td>
                    <span className="mono">{a.order_id}</span>
                    <br />
                    <strong>{a.name}</strong>
                    <br />
                    <small className="muted">{timeLabel(a.created_at)}</small>
                  </td>
                  <td>
                    <span className="status danger-badge">
                      {reasonLabel(a.reason)}
                    </span>
                    {a.purchase_order_id && (
                      <small className="admin-block muted">
                        Đơn nhập: {a.purchase_order_id}
                      </small>
                    )}
                  </td>
                  <td>
                    <strong>
                      {a.delivered_quantity}/{a.quantity}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </SmartTable>
        </div>
      )}
      {selected && (
        <div
          className="admin-popup-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <form
            ref={resolveRef}
            className="admin-detail panel-focus-target"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (selected.status === "DELIVERED") {
                  await api(
                    `/api/admin/fulfillment-alerts/${encodeURIComponent(selected.id)}/acknowledge`,
                    { body: { reason } },
                  );
                  setSelected(null);
                  await load();
                  return;
                }
                await api(
                  `/api/admin/fulfillments/${encodeURIComponent(selected.fulfillment_id)}/resolve`,
                  {
                    body: {
                      values: values
                        .split("\n")
                        .map((v) => v.trim())
                        .filter(Boolean),
                      reason,
                      expectedAttempt: selected.attempts,
                    },
                  },
                );
                setSelected(null);
                await load();
              });
            }}
          >
            <div className="panel-heading">
              <h3>
                Xử lý đơn {selected.order_id} · {selected.name}
              </h3>
              <button type="button" onClick={() => setSelected(null)}>
                Đóng
              </button>
            </div>
            <p>
              {reasonLabel(selected.reason)}. Kiểm tra kết quả NCC và lịch sử
              nhập hàng trước khi xử lý.
            </p>
            <label>
              Lý do / kết quả đối soát
              <input
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {selected.status !== "DELIVERED" && (
              <label>
                Bổ sung dữ liệu giao hàng (mỗi dòng một đơn vị, còn thiếu{" "}
                {selected.quantity - selected.delivered_quantity})
                <textarea
                  value={values}
                  onChange={(e) => setValues(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <div className="action-row" style={{ marginBottom: 12 }}>
              <button
                className="primary"
                disabled={selected.status !== "DELIVERED" && !values.trim()}
              >
                {selected.status === "DELIVERED"
                  ? "Đóng cảnh báo sau đối soát"
                  : "Giao phần còn thiếu"}
              </button>
            </div>
            {selected.delivered_quantity === 0 && (
              <div className="stack">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  Tôi đã đối soát lần xử lý này và xác nhận chưa có giao dịch mua
                  thành công cần nhận hàng.
                </label>
                <div>
                  <button
                    type="button"
                    disabled={!confirmed || reason.trim().length < 5}
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `/api/admin/fulfillments/${encodeURIComponent(selected.fulfillment_id)}/retry`,
                          {
                            body: {
                              confirmedNoPurchase: true,
                              reason,
                              expectedAttempt: selected.attempts,
                            },
                          },
                        );
                        setSelected(null);
                        await load();
                      })
                    }
                  >
                    Cho phép thực hiện lại sau đối soát
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </section>
  );
}

interface SupplierOrder {
  id: string;
  user_id: string | null;
  linked_transaction_id?: number | null;
  provider_id: string;
  product_name: string;
  quantity: number;
  status: string;
  total_price: number;
  currency: string;
  provider_order_id: string | null;
  delivered_items: string[];
  can_check_status: boolean;
  can_import_to_stock?: boolean;
  created_at: string;
}

/**
 * Quản lý đơn nhập hàng từ nhà cung cấp, đồng bộ lịch sử, kiểm tra trạng thái và nhập kho.
 */
export function PurchaseOrders({
  run,
  ownerId,
  initialSelection,
}: {
  run: Run;
  ownerId: string;
  initialSelection?: VendorSelection | null;
}) {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [provider, setProvider] = useState(initialSelection?.providerId ?? "");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>(initialSelection ? [initialSelection.product] : []);
  const [item, setItem] = useState(initialSelection?.product.provider_product_id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [destination, setDestination] = useState<"self" | "stock">("self");
  const [stockProductId, setStockProductId] = useState("");
  const [stockProducts, setStockProducts] = useState<Product[]>([]);
  const [purchaseNotice, setPurchaseNotice] = useState("");
  const [buying, setBuying] = useState(false);
  const [manualStatus, setManualStatus] = useState("");
  const [manualDelivered, setManualDelivered] = useState("");
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(Boolean(initialSelection));
  const detailRef = useRef<HTMLDivElement | null>(null);

  async function load(query = search, provFilter = providerFilter) {
    const providerQuery = provFilter
      ? `&provider_id=${encodeURIComponent(provFilter)}`
      : "";
    const [history, directory, catalog] = await Promise.all([
      api<{ orders: SupplierOrder[] }>(
        `${supplierApi}/orders?limit=100&search=${encodeURIComponent(query)}${providerQuery}`,
      ),
      api<{ providers: Provider[] }>(`${supplierApi}/providers`),
      api<{ products: Product[] }>("/api/admin/products"),
    ]);
    setOrders(history.orders);
    setProviders(directory.providers);
    setStockProducts(
      catalog.products.filter((product) => product.source === "stock"),
    );
  }

  useEffect(() => {
    void run(() => load("", ""));
  }, [run]);

  const canImportSelected = Boolean(
    selected &&
      (selected.user_id === ownerId ||
        selected.user_id === "system_sync" ||
        !selected.user_id) &&
      !selected.linked_transaction_id &&
      selected.status === "completed" &&
      selected.delivered_items?.length > 0,
  );

  return (
    <div className="admin-split-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Đơn nhập nhà cung cấp</h2>
            <p className="muted">
              Bấm vào dòng đơn nhập để xem dữ liệu NCC giao hoặc đẩy hàng vào
              kho sản phẩm tự tạo.
            </p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="primary"
              onClick={() => setPurchaseFormOpen(true)}
            >
              Mua hàng từ NCC
            </button>
            {providerFilter && (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const res = await api<{ message: string }>(
                      `${supplierApi}/orders/sync-provider/${encodeURIComponent(providerFilter)}`,
                      { body: {} },
                    );
                    setPurchaseNotice(res.message);
                    await load(search, providerFilter);
                  })
                }
              >
                Đồng bộ NCC đang lọc
              </button>
            )}
            <button
              onClick={() =>
                void run(async () => {
                  await api(`${supplierApi}/orders/sync-all`, { body: {} });
                  await load(search, providerFilter);
                })
              }
            >
              Đồng bộ lịch sử NCC
            </button>
          </div>
        </div>
        {purchaseNotice && (
          <p role="status" className="notice">
            {purchaseNotice}
          </p>
        )}
        <form
          className="admin-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load(search, providerFilter));
          }}
        >
          <input
            aria-label="Tìm đơn nhập"
            value={search}
            placeholder="Tìm đơn nhập…"
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Lọc theo nhà cung cấp"
            value={providerFilter}
            onChange={(e) => {
              const next = e.target.value;
              setProviderFilter(next);
              void run(() => load(search, next));
            }}
          >
            <option value="">Tất cả NCC</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
          <button className="primary">Tìm</button>
        </form>
        <div className="table-wrap">
          <SmartTable>
            <thead>
              <tr>
                <th>Đơn / NCC</th>
                <th>Sản phẩm</th>
                <th>Giá nhập</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className={`clickable-row ${selected?.id === o.id ? "selected-row" : ""}`}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ order: SupplierOrder }>(
                        `${supplierApi}/orders/${encodeURIComponent(o.id)}`,
                      );
                      setSelected(result.order);
                      setManualStatus(result.order.status);
                      setManualDelivered(
                        result.order.delivered_items?.join("\n") ?? "",
                      );
                      focusPanel(detailRef.current);
                    })
                  }
                >
                  <td>
                    <strong className="mono">{o.id}</strong>
                    <br />
                    <small className="muted">{o.provider_id}</small>
                  </td>
                  <td>
                    <strong>{o.product_name}</strong> × {o.quantity}
                  </td>
                  <td>
                    <strong>
                      {o.total_price} {o.currency}
                    </strong>
                  </td>
                  <td>
                    <span
                      className={
                        o.status === "completed"
                          ? "status good"
                          : o.status === "failed" || o.status === "cancelled"
                            ? "status danger-badge"
                            : "status"
                      }
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </SmartTable>
        </div>
        {selected && (
          <div
            className="admin-popup-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <div className="admin-detail panel-focus-target" ref={detailRef}>
              <div className="panel-heading">
                <h3>Đơn nhập {selected.id}</h3>
                <button type="button" onClick={() => setSelected(null)}>
                  Đóng
                </button>
              </div>
              <p>
                NCC: <strong>{selected.provider_id}</strong> · Mã NCC:{" "}
                <span className="mono">
                  {selected.provider_order_id ?? "Chưa có"}
                </span>{" "}
                · <span className="status">{selected.status}</span>
              </p>
              <pre className="code-block">
                {selected.delivered_items?.join("\n") ||
                  "Chưa có dữ liệu giao hàng"}
              </pre>
              <div className="action-row" style={{ marginTop: 12 }}>
                {canImportSelected && (
                  <button
                    className="primary"
                    onClick={() =>
                      void run(async () => {
                        if (!stockProductId)
                          throw new Error("Chọn sản phẩm kho trước khi nhập");
                        const result = await api<{
                          added: number;
                          total: number;
                        }>(
                          `/api/admin/supplier-purchases/${encodeURIComponent(selected.id)}/import`,
                          {
                            body: { productId: Number(stockProductId) },
                          },
                        );
                        setPurchaseNotice(
                          result.added
                            ? `Đã nhập ${result.added} đơn vị từ đơn ${selected.id} vào kho.`
                            : `Đơn ${selected.id} đã có ${result.total} đơn vị trong kho; không nhập trùng.`,
                        );
                        await load(search, providerFilter);
                      })
                    }
                  >
                    Nhập đơn này vào kho
                  </button>
                )}
                {selected.can_check_status && (
                  <button
                    onClick={() =>
                      void run(async () => {
                        const checkRes = await api<{
                          status: string;
                          raw_status: string;
                        }>(
                          `${supplierApi}/orders/${encodeURIComponent(selected.id)}/check-status`,
                          { body: {} },
                        );
                        await load(search, providerFilter);
                        const detail = await api<{ order: SupplierOrder }>(
                          `${supplierApi}/orders/${encodeURIComponent(selected.id)}`,
                        );
                        setSelected(detail.order);
                        setManualStatus(detail.order.status);
                        setManualDelivered(
                          detail.order.delivered_items?.join("\n") ?? "",
                        );
                        setPurchaseNotice(
                          `Trạng thái đơn ${selected.id}: ${checkRes.status} (${checkRes.raw_status || "đã kiểm tra"})`,
                        );
                      })
                    }
                  >
                    Kiểm tra trạng thái NCC
                  </button>
                )}
                {!selected.linked_transaction_id && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `${supplierApi}/orders/${encodeURIComponent(selected.id)}`,
                          { method: "DELETE" },
                        );
                        setPurchaseNotice(`Đã xóa đơn nhập ${selected.id}.`);
                        setSelected(null);
                        await load(search, providerFilter);
                      })
                    }
                  >
                    Xóa đơn nhập
                  </button>
                )}
              </div>
              {canImportSelected && (
                <label style={{ marginTop: 12 }}>
                  Sản phẩm kho nhận hàng
                  <select
                    value={stockProductId}
                    onChange={(e) => setStockProductId(e.target.value)}
                  >
                    <option value="">Chọn sản phẩm kho</option>
                    {stockProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · #{product.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details>
                <summary>
                  Cập nhật thủ công trạng thái / dữ liệu nhận được
                </summary>
                <div className="form-grid">
                  <label>
                    Trạng thái đơn nhập
                    <select
                      value={manualStatus || selected.status}
                      onChange={(e) => setManualStatus(e.target.value)}
                    >
                      <option value="completed">completed (Đã hoàn tất)</option>
                      <option value="processing">processing (Đang xử lý)</option>
                      <option value="pending">pending (Chờ xử lý)</option>
                      <option value="failed">failed (Thất bại)</option>
                      <option value="cancelled">cancelled (Đã hủy)</option>
                    </select>
                  </label>
                </div>
                <label>
                  Dữ liệu giao hàng nhận được (mỗi dòng 1 mục)
                  <textarea
                    value={manualDelivered}
                    onChange={(e) => setManualDelivered(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `${supplierApi}/orders/${encodeURIComponent(selected.id)}/status`,
                        {
                          method: "PATCH",
                          body: {
                            status: manualStatus || selected.status,
                            delivered_items: manualDelivered,
                          },
                        },
                      );
                      await load(search, providerFilter);
                      const detail = await api<{ order: SupplierOrder }>(
                        `${supplierApi}/orders/${encodeURIComponent(selected.id)}`,
                      );
                      setSelected(detail.order);
                      setPurchaseNotice(
                        `Đã cập nhật trạng thái đơn ${selected.id} thành ${detail.order.status}.`,
                      );
                    })
                  }
                >
                  Lưu trạng thái đơn nhập
                </button>
              </details>
            </div>
          </div>
        )}
      </section>

      <aside
        className={`admin-sticky-pane admin-detail-pane ${purchaseFormOpen ? "is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPurchaseFormOpen(false);
        }}
      >
        <section className="panel">
          <div className="panel-heading">
            <h2>Mua hàng từ nhà cung cấp</h2>
            <button
              type="button"
              className="admin-mobile-only"
              onClick={() => setPurchaseFormOpen(false)}
            >
              Đóng
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (buying) return;
              setBuying(true);
              void run(async () => {
                const selectedProduct = vendorProducts.find(
                  (v) => v.provider_product_id === item,
                );
                if (!selectedProduct) throw new Error("Chọn sản phẩm NCC");
                if (destination === "stock" && !stockProductId)
                  throw new Error("Chọn sản phẩm kho nhận hàng");
                const purchase = await api<{
                  order_id: string;
                  status: string;
                  persisted: boolean;
                }>(`${supplierApi}/order`, {
                  body: {
                    provider_id: provider,
                    product_id: item,
                    product_name: selectedProduct.name,
                    quantity,
                    email,
                    unit_price: selectedProduct.price_usd,
                    total_price: selectedProduct.price_usd * quantity,
                  },
                });
                setPurchaseNotice(
                  `Đã gửi yêu cầu mua NCC. Mã đơn: ${purchase.order_id}. ${purchase.persisted ? "" : "NCC đã xử lý nhưng chưa lưu được đơn; cần đối soát, không mua lại."}`,
                );
                if (!purchase.persisted) return;
                await load(search, providerFilter);
                const detail = await api<{ order: SupplierOrder }>(
                  `${supplierApi}/orders/${encodeURIComponent(purchase.order_id)}`,
                );
                setSelected(detail.order);
                setManualStatus(detail.order.status);
                setManualDelivered(
                  detail.order.delivered_items?.join("\n") ?? "",
                );
                setPurchaseFormOpen(false);
                if (destination === "stock") {
                  if (purchase.status !== "completed") {
                    setPurchaseNotice(
                      `Đơn ${purchase.order_id} đang chờ NCC giao. Sau khi hoàn tất, mở đơn và chọn Nhập đơn này vào kho.`,
                    );
                    return;
                  }
                  const imported = await api<{
                    added: number;
                    total: number;
                  }>(
                    `/api/admin/supplier-purchases/${encodeURIComponent(purchase.order_id)}/import`,
                    {
                      body: { productId: Number(stockProductId) },
                    },
                  );
                  setPurchaseNotice(
                    `Đã mua đơn ${purchase.order_id} và nhập ${imported.added} đơn vị vào kho.`,
                  );
                  await load(search, providerFilter);
                }
              }).finally(() => setBuying(false));
            }}
          >
            <div className="form-grid">
              <label>
                NCC
                <select
                  required
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setVendorProducts([]);
                    setItem("");
                  }}
                >
                  <option value="">Chọn NCC</option>
                  {providers
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  marginBottom: 14,
                }}
              >
                <button
                  type="button"
                  disabled={!provider}
                  onClick={() =>
                    void run(async () => {
                      setVendorProducts(
                        (
                          await api<{ products: VendorProduct[] }>(
                            `${supplierApi}/products?provider_id=${encodeURIComponent(provider)}`,
                          )
                        ).products,
                      );
                    })
                  }
                >
                  Tải sản phẩm
                </button>
              </div>
              <label>
                Sản phẩm
                <select
                  required
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                >
                  <option value="">Chọn sản phẩm</option>
                  {vendorProducts
                    .filter((p) => p.in_stock)
                    .map((p) => (
                      <option
                        key={p.provider_product_id}
                        value={p.provider_product_id}
                      >
                        {p.name} · {p.price_usd} USD
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Số lượng
                <input
                  required
                  type="number"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
              <label>
                Email kích hoạt (nếu cần)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Mục đích mua
                <select
                  value={destination}
                  onChange={(e) =>
                    setDestination(e.target.value as "self" | "stock")
                  }
                >
                  <option value="self">
                    Dùng riêng · xem dữ liệu trong chi tiết đơn
                  </option>
                  <option value="stock">Nhập vào kho của tôi</option>
                </select>
              </label>
              {destination === "stock" && (
                <label>
                  Sản phẩm kho nhận hàng
                  <select
                    required
                    value={stockProductId}
                    onChange={(e) => setStockProductId(e.target.value)}
                  >
                    <option value="">Chọn sản phẩm kho</option>
                    {stockProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · #{product.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <button className="primary" disabled={buying}>
              {buying ? "Đang gửi đơn mua…" : "Mua từ NCC"}
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

interface Transaction {
  id: number;
  type: string;
  date: string;
  product_name: string;
  customer_info: string;
  cost_price: number;
  sale_price: number;
  delivered_data: string;
  warranty_period: string;
  warranty_note: string;
  warranty_status: string;
  warranty_expire_date: string | null;
  purchase_order_id: string | null;
}

interface TransactionResponse {
  id: number;
  type: string;
  date: string;
  productName: string;
  customerInfo: string;
  costPrice: number;
  salePrice: number;
  deliveredData: string;
  warrantyPeriod: string;
  warrantyNote: string;
  warrantyStatus: string;
  warrantyExpireDate: string | null;
  purchaseOrderId: string | null;
}

const transactionRow = (t: TransactionResponse): Transaction => ({
  id: t.id,
  type: t.type,
  date: t.date,
  product_name: t.productName,
  customer_info: t.customerInfo,
  cost_price: t.costPrice,
  sale_price: t.salePrice,
  delivered_data: t.deliveredData,
  warranty_period: t.warrantyPeriod,
  warranty_note: t.warrantyNote,
  warranty_status: t.warrantyStatus,
  warranty_expire_date: t.warrantyExpireDate,
  purchase_order_id: t.purchaseOrderId,
});

const emptyTransaction = () => ({
  type: "sale",
  date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
  product_name: "",
  customer_info: "",
  cost_price: 0,
  sale_price: 0,
  delivered_data: "",
  warranty_period: "none",
  warranty_note: "",
  warranty_status: "valid",
  purchase_order_id: null as string | null,
});

type ReportTypeChip =
  | "all"
  | "overview"
  | "store"
  | "mmo"
  | "expense"
  | "monthly";

type ReportPeriodChip = "all" | "day" | "week" | "month" | "year" | "custom";

type MonthQuickScope = "all" | "q1" | "q2" | "q3" | "q4" | "active";

/**
 * Lấy chuỗi ngày hiện tại định dạng YYYY-MM-DD theo múi giờ Việt Nam.
 */
function getTodayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/**
 * Dịch chuyển một ngày YYYY-MM-DD theo số ngày cộng/trừ.
 */
function shiftIsoDate(baseIso: string, deltaDays: number): string {
  const d = new Date(`${baseIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return getTodayIso();
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().split("T")[0];
}

/**
 * Xác định ngày đầu tuần (Thứ Hai) và cuối tuần (Chủ Nhật) của một ngày YYYY-MM-DD.
 */
function getIsoWeekBounds(anchorIso: string): { from: string; to: string } {
  const d = new Date(`${anchorIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const fallback = getTodayIso();
    return { from: fallback, to: fallback };
  }
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().split("T")[0],
    to: sunday.toISOString().split("T")[0],
  };
}

/**
 * Xác định ngày đầu tháng và cuối tháng từ chuỗi YYYY-MM.
 */
function getIsoMonthBounds(monthIso: string): { from: string; to: string } {
  const [yStr, mStr] = monthIso.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) {
    const today = getTodayIso();
    return { from: today, to: today };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const padM = String(m).padStart(2, "0");
  return {
    from: `${y}-${padM}-01`,
    to: `${y}-${padM}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Định dạng chuỗi YYYY-MM-DD sang dd/MM/yyyy dễ đọc cho quản trị viên.
 */
function formatViDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Hiển thị báo cáo doanh thu, giá vốn và lợi nhuận theo từng tháng của hệ thống MMO.
 */
function MonthlyReport({
  run,
  selectedMonthKey,
  onSelectMonth,
}: {
  run: Run;
  selectedMonthKey?: string;
  onSelectMonth?: (monthKey: string) => void;
}) {
  const [currentYear] = useState(() => Number(getTodayIso().slice(0, 4)));
  const [year, setYear] = useState(() => Number(getTodayIso().slice(0, 4)));
  const [monthScope, setMonthScope] = useState<MonthQuickScope>("all");
  const [yearSummary, setYearSummary] = useState<{
    totalRevenue: number;
    totalCost: number;
    totalOtherExpense: number;
    totalExpense: number;
    netProfit: number;
    profitMargin?: number;
  } | null>(null);
  const [months, setMonths] = useState<
    {
      month: number;
      label: string;
      shortLabel?: string;
      monthKey?: string;
      revenue: number;
      cost: number;
      otherExpense: number;
      totalExpense: number;
      profit: number;
      countSales?: number;
    }[]
  >([]);

  async function load(reportYear: number) {
    const report = await api<{
      months: typeof months;
      yearSummary: typeof yearSummary;
    }>(`${supplierApi}/reports/monthly?year=${reportYear}`);
    setMonths(report.months);
    setYearSummary(report.yearSummary);
  }

  useEffect(() => {
    void run(() => load(new Date().getFullYear()));
  }, [run]);

  const quickYears = [currentYear, currentYear - 1, currentYear - 2];

  const visibleMonths = months.filter((m) => {
    if (monthScope === "q1") return m.month >= 1 && m.month <= 3;
    if (monthScope === "q2") return m.month >= 4 && m.month <= 6;
    if (monthScope === "q3") return m.month >= 7 && m.month <= 9;
    if (monthScope === "q4") return m.month >= 10 && m.month <= 12;
    if (monthScope === "active")
      return m.revenue > 0 || m.totalExpense > 0 || m.profit !== 0;
    return true;
  });

  const maxPeak = Math.max(
    1,
    ...months.map((m) => Math.max(m.revenue, m.totalExpense)),
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Báo cáo theo tháng</h2>
          <p className="muted">
            Chọn nhanh năm hoặc quý bên dưới. Bấm vào dòng tháng để lọc nhanh
            báo cáo chi tiết theo tháng đó.
          </p>
        </div>
        <form
          className="action-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load(year));
          }}
        >
          <label style={{ marginBottom: 0 }}>
            Năm báo cáo
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <button className="primary">Xem báo cáo năm</button>
        </form>
      </div>

      <div className="report-chip-stack" style={{ marginBottom: 12 }}>
        <div
          className="report-chip-row"
          role="group"
          aria-label="Chọn nhanh năm báo cáo tháng"
        >
          <span className="report-chip-label">Năm nhanh:</span>
          {quickYears.map((y) => (
            <button
              key={y}
              type="button"
              className={`report-chip ${year === y ? "primary" : ""}`}
              onClick={() => {
                setYear(y);
                void run(() => load(y));
              }}
            >
              Năm {y}
            </button>
          ))}
        </div>
        <div
          className="report-chip-row"
          role="group"
          aria-label="Lọc nhanh chu kỳ tháng"
        >
          <span className="report-chip-label">Chu kỳ tháng:</span>
          {(
            [
              ["all", "Cả 12 tháng"],
              ["q1", "Quý 1 (T1–T3)"],
              ["q2", "Quý 2 (T4–T6)"],
              ["q3", "Quý 3 (T7–T9)"],
              ["q4", "Quý 4 (T10–T12)"],
              ["active", "Có phát sinh"],
            ] as const
          ).map(([scopeKey, label]) => (
            <button
              key={scopeKey}
              type="button"
              className={`report-chip ${monthScope === scopeKey ? "primary" : ""}`}
              onClick={() => setMonthScope(scopeKey)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <SmartTable>
          <thead>
            <tr>
              <th>Tháng</th>
              <th>Doanh thu</th>
              <th>Giá vốn</th>
              <th>Chi phí khác</th>
              <th>Tổng chi phí</th>
              <th>Lợi nhuận</th>
            </tr>
          </thead>
          <tbody>
            {visibleMonths.map((m) => {
              const monthKey =
                m.monthKey ?? `${year}-${String(m.month).padStart(2, "0")}`;
              const isSelected = selectedMonthKey === monthKey;
              const revPct = Math.round((m.revenue / maxPeak) * 100);
              const expPct = Math.round((m.totalExpense / maxPeak) * 100);
              return (
                <tr
                  key={m.month}
                  className={
                    onSelectMonth
                      ? `clickable-row ${isSelected ? "selected-row" : ""}`
                      : ""
                  }
                  onClick={() => onSelectMonth?.(monthKey)}
                >
                  <td>
                    <strong>{m.label}</strong>
                    {typeof m.countSales === "number" && m.countSales > 0 && (
                      <>
                        {" "}
                        <span className="status neutral">
                          {m.countSales} đơn
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <strong className={m.revenue > 0 ? "positive" : ""}>
                      {amountLabel(m.revenue)}
                    </strong>
                    {m.revenue > 0 && (
                      <div className="report-mini-track" aria-hidden="true">
                        <div
                          className="report-mini-fill good"
                          style={{ width: `${Math.max(4, revPct)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td>{amountLabel(m.cost)}</td>
                  <td>{amountLabel(m.otherExpense)}</td>
                  <td>
                    <span>{amountLabel(m.totalExpense)}</span>
                    {m.totalExpense > 0 && (
                      <div className="report-mini-track" aria-hidden="true">
                        <div
                          className="report-mini-fill danger"
                          style={{ width: `${Math.max(4, expPct)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    <strong className={m.profit >= 0 ? "positive" : "danger"}>
                      {m.profit > 0 ? "+" : ""}
                      {amountLabel(m.profit)}
                    </strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {yearSummary && (
            <tfoot>
              <tr>
                <th>Tổng năm {year}</th>
                <td>
                  <strong className="positive">
                    {amountLabel(yearSummary.totalRevenue)}
                  </strong>
                </td>
                <td>{amountLabel(yearSummary.totalCost)}</td>
                <td>{amountLabel(yearSummary.totalOtherExpense)}</td>
                <td>{amountLabel(yearSummary.totalExpense)}</td>
                <td>
                  <strong
                    className={
                      yearSummary.netProfit >= 0 ? "positive" : "danger"
                    }
                  >
                    {yearSummary.netProfit > 0 ? "+" : ""}
                    {amountLabel(yearSummary.netProfit)}
                  </strong>
                </td>
              </tr>
            </tfoot>
          )}
        </SmartTable>
      </div>
    </section>
  );
}

/**
 * Quản lý sổ giao dịch MMO, chi phí, lợi nhuận và tra cứu/xử lý bảo hành.
 */
export function BusinessFinance({
  run,
  warrantyOnly = false,
  reportOnly = false,
  transactionsOnly = false,
}: {
  run: Run;
  warrantyOnly?: boolean;
  reportOnly?: boolean;
  transactionsOnly?: boolean;
}) {
  const [today] = useState(getTodayIso);
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [automatic, setAutomatic] = useState<Record<string, number>>({});
  const [form, setForm] = useState(emptyTransaction);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [warrantyStatusFilter, setWarrantyStatusFilter] = useState("all");
  const [warrantyCounts, setWarrantyCounts] = useState<{
    all: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    lifetime: number;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const formRef = useRef<HTMLElement | null>(null);

  const [reportType, setReportType] = useState<ReportTypeChip>("all");
  const [periodChip, setPeriodChip] = useState<ReportPeriodChip>("all");
  const [quickPreset, setQuickPreset] = useState<string>("all");
  const [dayValue, setDayValue] = useState<string>(today);
  const [weekAnchor, setWeekAnchor] = useState<string>(today);
  const [monthValue, setMonthValue] = useState<string>(currentMonth);
  const [yearValue, setYearValue] = useState<string>(currentYear);
  const [customFrom, setCustomFrom] = useState<string>(shiftIsoDate(today, -6));
  const [customTo, setCustomTo] = useState<string>(today);

  function buildPeriodQuery(
    period: ReportPeriodChip,
    opts?: {
      day?: string;
      week?: string;
      month?: string;
      year?: string;
      from?: string;
      to?: string;
    },
  ): { mmoQuery: string; commerceQuery: string } {
    const d = opts?.day ?? dayValue;
    const w = opts?.week ?? weekAnchor;
    const m = opts?.month ?? monthValue;
    const y = opts?.year ?? yearValue;
    const cf = opts?.from ?? customFrom;
    const ct = opts?.to ?? customTo;

    if (period === "day" && d) {
      return {
        mmoQuery: `period=day&date=${encodeURIComponent(d)}`,
        commerceQuery: `?from_date=${encodeURIComponent(d)}&to_date=${encodeURIComponent(d)}`,
      };
    }
    if (period === "week" && w) {
      const bounds = getIsoWeekBounds(w);
      return {
        mmoQuery: `period=week&date=${encodeURIComponent(w)}&from_date=${encodeURIComponent(bounds.from)}&to_date=${encodeURIComponent(bounds.to)}`,
        commerceQuery: `?from_date=${encodeURIComponent(bounds.from)}&to_date=${encodeURIComponent(bounds.to)}`,
      };
    }
    if (period === "month" && m) {
      const bounds = getIsoMonthBounds(m);
      return {
        mmoQuery: `period=month&month=${encodeURIComponent(m)}`,
        commerceQuery: `?from_date=${encodeURIComponent(bounds.from)}&to_date=${encodeURIComponent(bounds.to)}`,
      };
    }
    if (period === "year" && y) {
      return {
        mmoQuery: `period=year&year=${encodeURIComponent(y)}`,
        commerceQuery: `?from_date=${encodeURIComponent(`${y}-01-01`)}&to_date=${encodeURIComponent(`${y}-12-31`)}`,
      };
    }
    if (period === "custom" && cf && ct) {
      return {
        mmoQuery: `period=custom&from_date=${encodeURIComponent(cf)}&to_date=${encodeURIComponent(ct)}`,
        commerceQuery: `?from_date=${encodeURIComponent(cf)}&to_date=${encodeURIComponent(ct)}`,
      };
    }
    return { mmoQuery: "", commerceQuery: "" };
  }

  async function load(
    query = search,
    onlyWarranty = warrantyOnly,
    txType = typeFilter,
    wStatus = warrantyStatusFilter,
    periodOverride?: ReportPeriodChip,
    periodOpts?: {
      day?: string;
      week?: string;
      month?: string;
      year?: string;
      from?: string;
      to?: string;
    },
  ) {
    if (onlyWarranty) {
      const res = await api<{
        list: TransactionResponse[];
        counts: typeof warrantyCounts;
      }>(
        `${supplierApi}/warranty/lookup?q=${encodeURIComponent(query)}&status=${encodeURIComponent(wStatus)}`,
      );
      setTransactions(res.list.map(transactionRow));
      setWarrantyCounts(res.counts ?? null);
      return;
    }
    const activePeriod = periodOverride ?? periodChip;
    const { mmoQuery, commerceQuery } = buildPeriodQuery(
      activePeriod,
      periodOpts,
    );
    const typeParam = txType ? `&type=${encodeURIComponent(txType)}` : "";
    const periodParam = mmoQuery ? `&${mmoQuery}` : "";
    const summaryUrl = mmoQuery
      ? `${supplierApi}/reports/summary?${mmoQuery}`
      : `${supplierApi}/reports/summary`;

    const [data, report, commerce] = await Promise.all([
      api<{ transactions: TransactionResponse[] }>(
        `${supplierApi}/transactions?q=${encodeURIComponent(query)}${typeParam}${periodParam}`,
      ),
      api<{ summary: Record<string, number> }>(summaryUrl),
      api<Record<string, number>>(`/api/admin/commerce-report${commerceQuery}`),
    ]);
    setTransactions(data.transactions.map(transactionRow));
    setSummary(report.summary);
    setAutomatic(commerce);
  }

  useEffect(() => {
    void run(() => load("", warrantyOnly, "", "all", "all"));
  }, [run, warrantyOnly]);

  function applyTimePreset(presetId: string) {
    setQuickPreset(presetId);
    const nowIso = getTodayIso();
    if (presetId === "all") {
      setPeriodChip("all");
      void run(() => load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "all"));
      return;
    }
    if (presetId === "today") {
      setPeriodChip("day");
      setDayValue(nowIso);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "day", {
          day: nowIso,
        }),
      );
      return;
    }
    if (presetId === "yesterday") {
      const yest = shiftIsoDate(nowIso, -1);
      setPeriodChip("day");
      setDayValue(yest);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "day", {
          day: yest,
        }),
      );
      return;
    }
    if (presetId === "this_week") {
      setPeriodChip("week");
      setWeekAnchor(nowIso);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "week", {
          week: nowIso,
        }),
      );
      return;
    }
    if (presetId === "last_week") {
      const prevWeek = shiftIsoDate(nowIso, -7);
      setPeriodChip("week");
      setWeekAnchor(prevWeek);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "week", {
          week: prevWeek,
        }),
      );
      return;
    }
    if (presetId === "last_7d") {
      const from7 = shiftIsoDate(nowIso, -6);
      setPeriodChip("custom");
      setCustomFrom(from7);
      setCustomTo(nowIso);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "custom", {
          from: from7,
          to: nowIso,
        }),
      );
      return;
    }
    if (presetId === "this_month") {
      const m = nowIso.slice(0, 7);
      setPeriodChip("month");
      setMonthValue(m);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "month", {
          month: m,
        }),
      );
      return;
    }
    if (presetId === "last_month") {
      const d = new Date(`${nowIso.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      const prevM = d.toISOString().slice(0, 7);
      setPeriodChip("month");
      setMonthValue(prevM);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "month", {
          month: prevM,
        }),
      );
      return;
    }
    if (presetId === "last_30d") {
      const from30 = shiftIsoDate(nowIso, -29);
      setPeriodChip("custom");
      setCustomFrom(from30);
      setCustomTo(nowIso);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "custom", {
          from: from30,
          to: nowIso,
        }),
      );
      return;
    }
    if (presetId === "this_year") {
      const y = nowIso.slice(0, 4);
      setPeriodChip("year");
      setYearValue(y);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "year", {
          year: y,
        }),
      );
      return;
    }
    if (presetId === "last_year") {
      const y = String(Number(nowIso.slice(0, 4)) - 1);
      setPeriodChip("year");
      setYearValue(y);
      void run(() =>
        load(search, warrantyOnly, typeFilter, warrantyStatusFilter, "year", {
          year: y,
        }),
      );
    }
  }

  function selectPeriodMode(mode: ReportPeriodChip) {
    setPeriodChip(mode);
    setQuickPreset(mode);
    void run(() =>
      load(search, warrantyOnly, typeFilter, warrantyStatusFilter, mode),
    );
  }

  const weekBounds = getIsoWeekBounds(weekAnchor);
  const activePeriodText =
    periodChip === "day"
      ? `Ngày ${formatViDate(dayValue)}`
      : periodChip === "week"
        ? `Tuần ${formatViDate(weekBounds.from)} – ${formatViDate(weekBounds.to)}`
        : periodChip === "month"
          ? `Tháng ${monthValue.split("-").reverse().join("/")}`
          : periodChip === "year"
            ? `Năm ${yearValue}`
            : periodChip === "custom"
              ? `${formatViDate(customFrom)} – ${formatViDate(customTo)}`
              : "Toàn thời gian";

  const storeRevenue = Number(automatic.revenue) || 0;
  const storeCost = Number(automatic.cost) || 0;
  const storeProfit = Number(automatic.profit) || 0;
  const storeReview = Number(automatic.review) || 0;

  const mmoRevenue = Number(summary.totalRevenue) || 0;
  const mmoCost = Number(summary.totalCost) || 0;
  const mmoOtherExpense = Number(summary.totalOtherExpense) || 0;
  const mmoExpense = Number(summary.totalExpense) || 0;
  const mmoProfit = Number(summary.netProfit) || 0;
  const mmoSalesCount = Number(summary.countSales) || 0;
  const mmoMargin =
    summary.profitMargin !== undefined
      ? Number(summary.profitMargin)
      : mmoRevenue > 0
        ? Number(((mmoProfit / mmoRevenue) * 100).toFixed(1))
        : 0;

  const combinedRevenue = storeRevenue + mmoRevenue;
  const combinedExpense = storeCost + mmoExpense;
  const combinedProfit = storeProfit + mmoProfit;
  const combinedMargin =
    combinedRevenue > 0
      ? Number(((combinedProfit / combinedRevenue) * 100).toFixed(1))
      : 0;

  const detailMetrics: {
    label: string;
    value: number;
    isCount?: boolean;
    badge: string;
    tone?: "positive" | "danger" | "default";
    groups: ReportTypeChip[];
  }[] = [
    {
      label: "Doanh thu cửa hàng",
      value: storeRevenue,
      badge: "Cửa hàng",
      tone: "positive",
      groups: ["all", "overview", "store"],
    },
    {
      label: "Giá vốn đã giao",
      value: storeCost,
      badge: "Cửa hàng",
      groups: ["all", "store", "expense"],
    },
    {
      label: "Lợi nhuận đã giao",
      value: storeProfit,
      badge: "Cửa hàng",
      tone: storeProfit >= 0 ? "positive" : "danger",
      groups: ["all", "overview", "store"],
    },
    {
      label: "Đơn cần xử lý",
      value: storeReview,
      isCount: true,
      badge: "Vận hành",
      tone: storeReview > 0 ? "danger" : "default",
      groups: ["all", "overview", "store"],
    },
    {
      label: "Doanh thu MMO cũ",
      value: mmoRevenue,
      badge: "Sổ MMO",
      tone: "positive",
      groups: ["all", "overview", "mmo"],
    },
    {
      label: "Chi phí MMO cũ",
      value: mmoExpense,
      badge: "Sổ MMO",
      groups: ["all", "overview", "mmo", "expense"],
    },
    {
      label: "Lợi nhuận MMO cũ",
      value: mmoProfit,
      badge: "Sổ MMO",
      tone: mmoProfit >= 0 ? "positive" : "danger",
      groups: ["all", "overview", "mmo"],
    },
    {
      label: "Giá vốn bán MMO",
      value: mmoCost,
      badge: "Chi phí MMO",
      groups: ["mmo", "expense"],
    },
    {
      label: "Chi phí khác MMO",
      value: mmoOtherExpense,
      badge: "Chi phí MMO",
      groups: ["mmo", "expense"],
    },
    {
      label: "Đơn bán MMO",
      value: mmoSalesCount,
      isCount: true,
      badge: "Sổ MMO",
      groups: ["mmo"],
    },
  ];

  const visibleDetailMetrics = detailMetrics.filter((m) =>
    m.groups.includes(reportType),
  );

  const txRevenueTotal = transactions
    .filter((t) => t.type === "sale")
    .reduce((sum, t) => sum + (Number(t.sale_price) || 0), 0);
  const txCostTotal = transactions.reduce(
    (sum, t) => sum + (Number(t.cost_price) || 0),
    0,
  );
  const txProfitTotal = txRevenueTotal - txCostTotal;

  return (
    <>
      {!warrantyOnly && !transactionsOnly && (
        <>
          <section className="panel report-control-panel">
            <div className="panel-heading">
              <div>
                <h2>Bộ lọc & Chọn nhanh báo cáo</h2>
                <p className="muted">
                  Chọn nhanh loại báo cáo và mốc thời gian ngày, tuần, tháng,
                  năm để đối soát số liệu tức thì.
                </p>
              </div>
              <div className="action-row">
                <span className="status good">{activePeriodText}</span>
                <button
                  type="button"
                  onClick={() =>
                    void run(() =>
                      load(
                        search,
                        warrantyOnly,
                        typeFilter,
                        warrantyStatusFilter,
                        periodChip,
                      ),
                    )
                  }
                >
                  Cập nhật số liệu
                </button>
              </div>
            </div>

            <div className="report-chip-stack">
              <div
                className="report-chip-row"
                role="group"
                aria-label="Loại báo cáo"
              >
                <span className="report-chip-label">Loại báo cáo:</span>
                {(
                  [
                    ["all", "Tất cả báo cáo"],
                    ["overview", "Tổng hợp Lãi / Lỗ"],
                    ["store", "Đơn cửa hàng"],
                    ["mmo", "Sổ giao dịch MMO"],
                    ["expense", "Chi phí & Giá vốn"],
                    ["monthly", "Chu kỳ 12 tháng"],
                  ] as const
                ).map(([typeId, label]) => (
                  <button
                    key={typeId}
                    type="button"
                    className={`report-chip ${reportType === typeId ? "primary" : ""}`}
                    onClick={() => setReportType(typeId)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                className="report-chip-row"
                role="group"
                aria-label="Thời gian báo cáo"
              >
                <span className="report-chip-label">Thời gian:</span>
                {(
                  [
                    ["all", "Tất cả"],
                    ["day", "Theo ngày"],
                    ["week", "Theo tuần"],
                    ["month", "Theo tháng"],
                    ["year", "Theo năm"],
                    ["custom", "Tùy chọn"],
                  ] as const
                ).map(([pId, label]) => (
                  <button
                    key={pId}
                    type="button"
                    className={`report-chip ${periodChip === pId ? "primary" : ""}`}
                    onClick={() => selectPeriodMode(pId)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                className="report-chip-row"
                role="group"
                aria-label="Chọn nhanh mốc thời gian"
              >
                <span className="report-chip-label">Chọn nhanh:</span>
                {(
                  [
                    ["today", "Hôm nay"],
                    ["yesterday", "Hôm qua"],
                    ["this_week", "Tuần này"],
                    ["last_week", "Tuần trước"],
                    ["last_7d", "7 ngày qua"],
                    ["this_month", "Tháng này"],
                    ["last_month", "Tháng trước"],
                    ["last_30d", "30 ngày qua"],
                    ["this_year", `Năm nay (${currentYear})`],
                    ["last_year", `Năm ${Number(currentYear) - 1}`],
                    ["all", "Toàn thời gian"],
                  ] as const
                ).map(([presetId, label]) => (
                  <button
                    key={presetId}
                    type="button"
                    className={`report-chip subtle-chip ${quickPreset === presetId ? "active-preset" : ""}`}
                    onClick={() => applyTimePreset(presetId)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {periodChip === "day" && (
                <div className="report-period-picker">
                  <button
                    type="button"
                    onClick={() => {
                      const prev = shiftIsoDate(dayValue, -1);
                      setDayValue(prev);
                      setQuickPreset("custom_day");
                      void run(() =>
                        load(
                          search,
                          warrantyOnly,
                          typeFilter,
                          warrantyStatusFilter,
                          "day",
                          { day: prev },
                        ),
                      );
                    }}
                  >
                    ‹ Ngày trước
                  </button>
                  <input
                    type="date"
                    aria-label="Chọn ngày báo cáo"
                    value={dayValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDayValue(next);
                      setQuickPreset("custom_day");
                      if (next) {
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "day",
                            { day: next },
                          ),
                        );
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = shiftIsoDate(dayValue, 1);
                      setDayValue(next);
                      setQuickPreset("custom_day");
                      void run(() =>
                        load(
                          search,
                          warrantyOnly,
                          typeFilter,
                          warrantyStatusFilter,
                          "day",
                          { day: next },
                        ),
                      );
                    }}
                  >
                    Ngày sau ›
                  </button>
                </div>
              )}

              {periodChip === "week" && (
                <div className="report-period-picker">
                  <button
                    type="button"
                    onClick={() => {
                      const prev = shiftIsoDate(weekAnchor, -7);
                      setWeekAnchor(prev);
                      setQuickPreset("custom_week");
                      void run(() =>
                        load(
                          search,
                          warrantyOnly,
                          typeFilter,
                          warrantyStatusFilter,
                          "week",
                          { week: prev },
                        ),
                      );
                    }}
                  >
                    ‹ Tuần trước
                  </button>
                  <input
                    type="date"
                    aria-label="Chọn ngày trong tuần báo cáo"
                    value={weekAnchor}
                    onChange={(e) => {
                      const next = e.target.value;
                      setWeekAnchor(next);
                      setQuickPreset("custom_week");
                      if (next) {
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "week",
                            { week: next },
                          ),
                        );
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = shiftIsoDate(weekAnchor, 7);
                      setWeekAnchor(next);
                      setQuickPreset("custom_week");
                      void run(() =>
                        load(
                          search,
                          warrantyOnly,
                          typeFilter,
                          warrantyStatusFilter,
                          "week",
                          { week: next },
                        ),
                      );
                    }}
                  >
                    Tuần sau ›
                  </button>
                  <span className="muted">
                    ({formatViDate(weekBounds.from)} →{" "}
                    {formatViDate(weekBounds.to)})
                  </span>
                </div>
              )}

              {periodChip === "month" && (
                <div className="report-period-picker">
                  <input
                    type="month"
                    aria-label="Chọn tháng báo cáo"
                    value={monthValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMonthValue(next);
                      setQuickPreset("custom_month");
                      if (next) {
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "month",
                            { month: next },
                          ),
                        );
                      }
                    }}
                  />
                  <div
                    className="report-chip-row"
                    role="group"
                    aria-label="Chọn nhanh tháng trong năm"
                  >
                    {Array.from({ length: 12 }, (_, idx) => {
                      const mNum = idx + 1;
                      const mKey = `${monthValue.slice(0, 4) || currentYear}-${String(mNum).padStart(2, "0")}`;
                      return (
                        <button
                          key={mKey}
                          type="button"
                          className={`report-chip ${monthValue === mKey ? "primary" : ""}`}
                          onClick={() => {
                            setMonthValue(mKey);
                            setQuickPreset("custom_month");
                            void run(() =>
                              load(
                                search,
                                warrantyOnly,
                                typeFilter,
                                warrantyStatusFilter,
                                "month",
                                { month: mKey },
                              ),
                            );
                          }}
                        >
                          T{mNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {periodChip === "year" && (
                <div className="report-period-picker">
                  {[
                    Number(currentYear),
                    Number(currentYear) - 1,
                    Number(currentYear) - 2,
                  ].map((y) => (
                    <button
                      key={y}
                      type="button"
                      className={`report-chip ${yearValue === String(y) ? "primary" : ""}`}
                      onClick={() => {
                        const nextY = String(y);
                        setYearValue(nextY);
                        setQuickPreset("custom_year");
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "year",
                            { year: nextY },
                          ),
                        );
                      }}
                    >
                      Năm {y}
                    </button>
                  ))}
                  <input
                    type="number"
                    aria-label="Chọn năm báo cáo"
                    min={2000}
                    max={2100}
                    value={yearValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      setYearValue(next);
                      setQuickPreset("custom_year");
                      if (/^\d{4}$/.test(next)) {
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "year",
                            { year: next },
                          ),
                        );
                      }
                    }}
                  />
                </div>
              )}

              {periodChip === "custom" && (
                <div className="report-period-picker">
                  <input
                    type="date"
                    aria-label="Từ ngày báo cáo"
                    value={customFrom}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setCustomFrom(nextFrom);
                      setQuickPreset("custom_range");
                      if (nextFrom && customTo) {
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "custom",
                            { from: nextFrom, to: customTo },
                          ),
                        );
                      }
                    }}
                  />
                  <span className="muted">→</span>
                  <input
                    type="date"
                    aria-label="Đến ngày báo cáo"
                    value={customTo}
                    onChange={(e) => {
                      const nextTo = e.target.value;
                      setCustomTo(nextTo);
                      setQuickPreset("custom_range");
                      if (customFrom && nextTo) {
                        void run(() =>
                          load(
                            search,
                            warrantyOnly,
                            typeFilter,
                            warrantyStatusFilter,
                            "custom",
                            { from: customFrom, to: nextTo },
                          ),
                        );
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </section>

          {["all", "overview", "expense"].includes(reportType) && (
            <div className="report-highlight-grid">
              <div className="report-highlight-card">
                <div className="report-card-top">
                  <span>Tổng doanh thu hợp nhất</span>
                  <span className="status good">{activePeriodText}</span>
                </div>
                <strong className="positive">
                  {amountLabel(combinedRevenue)}
                </strong>
                <small className="muted">
                  Cửa hàng: {amountLabel(storeRevenue)} · MMO:{" "}
                  {amountLabel(mmoRevenue)}
                </small>
              </div>
              <div className="report-highlight-card">
                <div className="report-card-top">
                  <span>Tổng chi phí & giá vốn</span>
                  <span className="status neutral">Chi & Vốn</span>
                </div>
                <strong>{amountLabel(combinedExpense)}</strong>
                <small className="muted">
                  Vốn giao: {amountLabel(storeCost)} · Chi MMO:{" "}
                  {amountLabel(mmoExpense)}
                </small>
              </div>
              <div className="report-highlight-card">
                <div className="report-card-top">
                  <span>Lợi nhuận ròng thực tế</span>
                  <span
                    className={
                      combinedProfit >= 0 ? "status good" : "status danger-badge"
                    }
                  >
                    {combinedProfit >= 0 ? "Lãi ròng" : "Lỗ ròng"}
                  </span>
                </div>
                <strong className={combinedProfit >= 0 ? "positive" : "danger"}>
                  {combinedProfit > 0 ? "+" : ""}
                  {amountLabel(combinedProfit)}
                </strong>
                <small className="muted">
                  Lãi cửa hàng: {amountLabel(storeProfit)} · Lãi MMO:{" "}
                  {amountLabel(mmoProfit)}
                </small>
              </div>
              <div className="report-highlight-card">
                <div className="report-card-top">
                  <span>Tỷ suất lãi & Vận hành</span>
                  <span className="status neutral">Hiệu suất</span>
                </div>
                <strong>{combinedMargin}%</strong>
                <small className="muted">
                  Biên MMO: {mmoMargin}% · {mmoSalesCount} đơn MMO ·{" "}
                  {storeReview} đơn cần xử lý
                </small>
              </div>
            </div>
          )}

          {visibleDetailMetrics.length > 0 && (
            <div className="metric-grid finance-summary">
              {visibleDetailMetrics.map((m) => (
                <div className="metric" key={m.label}>
                  <div className="report-card-top">
                    <span>{m.label}</span>
                    <small className="status neutral">{m.badge}</small>
                  </div>
                  <strong
                    className={
                      m.tone === "positive"
                        ? "positive"
                        : m.tone === "danger"
                          ? "danger"
                          : ""
                    }
                  >
                    {m.isCount ? m.value : amountLabel(m.value)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!warrantyOnly &&
        reportOnly &&
        (reportType === "all" || reportType === "monthly") && (
          <MonthlyReport
            run={run}
            selectedMonthKey={periodChip === "month" ? monthValue : undefined}
            onSelectMonth={(monthKey) => {
              setPeriodChip("month");
              setMonthValue(monthKey);
              setQuickPreset("custom_month");
              void run(() =>
                load(
                  search,
                  warrantyOnly,
                  typeFilter,
                  warrantyStatusFilter,
                  "month",
                  { month: monthKey },
                ),
              );
            }}
          />
        )}
      {!reportOnly && (
        <div className="admin-split-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {warrantyOnly ? "Tra cứu & xử lý bảo hành" : "Sổ giao dịch"}
                </h2>
                <p className="muted">
                  Bấm vào dòng giao dịch để xem chi tiết, chỉnh sửa hoặc cập nhật
                  bảo hành.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setSelected(null);
                  setForm(emptyTransaction());
                  setEditorOpen(true);
                  focusPanel(formRef.current);
                }}
              >
                Ghi giao dịch mới
              </button>
            </div>
            {warrantyOnly && warrantyCounts && (
              <div className="admin-filter-pills">
                {(
                  [
                    ["all", `Tất cả (${warrantyCounts.all})`],
                    ["valid", `Còn hạn (${warrantyCounts.valid})`],
                    [
                      "expiring_soon",
                      `Sắp hết hạn (${warrantyCounts.expiringSoon})`,
                    ],
                    ["expired", `Hết hạn (${warrantyCounts.expired})`],
                    ["lifetime", `Trọn đời (${warrantyCounts.lifetime})`],
                  ] as const
                ).map(([statusKey, label]) => (
                  <button
                    key={statusKey}
                    type="button"
                    className={warrantyStatusFilter === statusKey ? "primary" : ""}
                    onClick={() => {
                      setWarrantyStatusFilter(statusKey);
                      void run(() =>
                        load(search, warrantyOnly, typeFilter, statusKey),
                      );
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {!warrantyOnly && (
              <>
                <div className="report-chip-stack" style={{ marginBottom: 12 }}>
                  <div
                    className="report-chip-row"
                    role="group"
                    aria-label="Chip loại giao dịch"
                  >
                    <span className="report-chip-label">Loại giao dịch:</span>
                    {(
                      [
                        ["", "Tất cả loại"],
                        ["sale", "Bán hàng"],
                        ["purchase", "Nhập hàng"],
                        ["expense", "Chi phí"],
                      ] as const
                    ).map(([tKey, tLabel]) => (
                      <button
                        key={tKey || "all"}
                        type="button"
                        className={`report-chip ${typeFilter === tKey ? "primary" : ""}`}
                        onClick={() => {
                          setTypeFilter(tKey);
                          void run(() =>
                            load(
                              search,
                              warrantyOnly,
                              tKey,
                              warrantyStatusFilter,
                              periodChip,
                            ),
                          );
                        }}
                      >
                        {tLabel}
                      </button>
                    ))}
                  </div>
                  <div
                    className="report-chip-row"
                    role="group"
                    aria-label="Chip thời gian giao dịch"
                  >
                    <span className="report-chip-label">Thời gian:</span>
                    {(
                      [
                        ["all", "Tất cả"],
                        ["today", "Hôm nay"],
                        ["yesterday", "Hôm qua"],
                        ["this_week", "Tuần này"],
                        ["this_month", "Tháng này"],
                        ["this_year", "Năm nay"],
                      ] as const
                    ).map(([presetKey, label]) => (
                      <button
                        key={presetKey}
                        type="button"
                        className={`report-chip subtle-chip ${quickPreset === presetKey ? "active-preset" : ""}`}
                        onClick={() => applyTimePreset(presetKey)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-kv-grid">
                  <div className="admin-kv-item">
                    <small>Bản ghi hiển thị ({activePeriodText})</small>
                    <strong>{transactions.length}</strong>
                  </div>
                  <div className="admin-kv-item">
                    <small>Doanh thu hiển thị</small>
                    <strong className="positive">
                      {amountLabel(txRevenueTotal)}
                    </strong>
                  </div>
                  <div className="admin-kv-item">
                    <small>Tổng vốn & chi phí</small>
                    <strong>{amountLabel(txCostTotal)}</strong>
                  </div>
                  <div className="admin-kv-item">
                    <small>Lợi nhuận ròng hiển thị</small>
                    <strong
                      className={txProfitTotal >= 0 ? "positive" : "danger"}
                    >
                      {txProfitTotal > 0 ? "+" : ""}
                      {amountLabel(txProfitTotal)}
                    </strong>
                  </div>
                </div>
              </>
            )}
            <form
              className="admin-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  load(
                    search,
                    warrantyOnly,
                    typeFilter,
                    warrantyStatusFilter,
                    periodChip,
                  ),
                );
              }}
            >
              <input
                aria-label="Tìm giao dịch bảo hành"
                placeholder="Tên sản phẩm, khách hàng…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {!warrantyOnly && (
                <select
                  aria-label="Lọc loại giao dịch"
                  value={typeFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTypeFilter(next);
                    void run(() =>
                      load(
                        search,
                        warrantyOnly,
                        next,
                        warrantyStatusFilter,
                        periodChip,
                      ),
                    );
                  }}
                >
                  <option value="">Tất cả loại</option>
                  <option value="sale">Bán hàng</option>
                  <option value="purchase">Nhập hàng</option>
                  <option value="expense">Chi phí</option>
                </select>
              )}
              <button className="primary">Tìm</button>
            </form>
          <div className="table-wrap">
            <SmartTable>
              <thead>
                <tr>
                  <th>Ngày / sản phẩm</th>
                  <th>Khách</th>
                  <th>Giá vốn / bán</th>
                  <th>Bảo hành</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr
                    key={t.id}
                    className={`clickable-row ${selected === t.id ? "selected-row" : ""}`}
                    onClick={() => {
                      setSelected(t.id);
                      setForm({ ...emptyTransaction(), ...t });
                      setEditorOpen(true);
                      focusPanel(formRef.current);
                    }}
                  >
                    <td>
                      <small className="muted">{t.date}</small>
                      <br />
                      <strong>{t.product_name}</strong> ·{" "}
                      <span className="status neutral">{t.type}</span>
                    </td>
                    <td>{t.customer_info || "—"}</td>
                    <td>
                      {amountLabel(t.cost_price)} /{" "}
                      <strong>{amountLabel(t.sale_price)}</strong>
                    </td>
                    <td>
                      <span
                        className={
                          t.warranty_status === "valid"
                            ? "status good"
                            : "status"
                        }
                      >
                        {t.warranty_status}
                      </span>
                      <br />
                      <small className="muted">
                        {t.warranty_expire_date ?? "—"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SmartTable>
          </div>
        </section>

        <aside
          className={`admin-sticky-pane admin-detail-pane ${editorOpen ? "is-open" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditorOpen(false);
          }}
        >
          <section className="panel panel-focus-target" ref={formRef}>
            <div className="panel-heading">
              <h2>
                {selected
                  ? `Chỉnh giao dịch #${selected}`
                  : "Ghi bán hàng / nhập hàng / chi phí"}
              </h2>
              <div className="action-row">
                {selected && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setForm(emptyTransaction());
                    }}
                  >
                    Ghi mới
                  </button>
                )}
                <button
                  type="button"
                  className="admin-mobile-only"
                  onClick={() => setEditorOpen(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api(
                    `${supplierApi}/transactions${selected ? `/${selected}` : ""}`,
                    { method: selected ? "PUT" : "POST", body: form },
                  );
                  setSelected(null);
                  setForm(emptyTransaction());
                  setEditorOpen(false);
                  await load(
                    search,
                    warrantyOnly,
                    typeFilter,
                    warrantyStatusFilter,
                  );
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Loại
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value })
                    }
                  >
                    <option value="sale">Bán hàng</option>
                    <option value="purchase">Nhập hàng</option>
                    <option value="expense">Chi phí</option>
                  </select>
                </label>
                <label>
                  Ngày
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) =>
                      setForm({ ...form, date: e.target.value })
                    }
                  />
                </label>
                <label>
                  Sản phẩm / nội dung
                  <input
                    required
                    value={form.product_name}
                    onChange={(e) =>
                      setForm({ ...form, product_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Khách hàng
                  <input
                    value={form.customer_info ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, customer_info: e.target.value })
                    }
                  />
                </label>
                <label>
                  Giá vốn VND
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.cost_price}
                    onChange={(e) =>
                      setForm({ ...form, cost_price: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Giá bán VND
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.sale_price}
                    onChange={(e) =>
                      setForm({ ...form, sale_price: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Thời hạn bảo hành
                  <select
                    value={form.warranty_period}
                    onChange={(e) =>
                      setForm({ ...form, warranty_period: e.target.value })
                    }
                  >
                    {[
                      ["none", "Không"],
                      ["7d", "7 ngày"],
                      ["1m", "1 tháng"],
                      ["3m", "3 tháng"],
                      ["6m", "6 tháng"],
                      ["12m", "1 năm"],
                      ["lifetime", "Trọn đời"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Đơn nhập NCC liên quan
                  <input
                    value={form.purchase_order_id ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchase_order_id: e.target.value || null,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Dữ liệu giao / thay thế bảo hành
                <textarea
                  value={form.delivered_data ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, delivered_data: e.target.value })
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                Ghi chú bảo hành
                <textarea
                  value={form.warranty_note ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, warranty_note: e.target.value })
                  }
                />
              </label>
              <div className="action-row" style={{ marginBottom: 14 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.warranty_status === "void"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        warranty_status: e.target.checked ? "void" : "valid",
                      })
                    }
                  />{" "}
                  Vô hiệu hóa bảo hành
                </label>
              </div>
              <div className="action-row">
                <button className="primary">Lưu giao dịch</button>
                {selected && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await api(`${supplierApi}/transactions/${selected}`, {
                          method: "DELETE",
                        });
                        setSelected(null);
                        setForm(emptyTransaction());
                        await load(
                          search,
                          warrantyOnly,
                          typeFilter,
                          warrantyStatusFilter,
                        );
                      })
                    }
                  >
                    Ẩn giao dịch này
                  </button>
                )}
              </div>
            </form>
          </section>
        </aside>
      </div>)}
    </>
  );
}
