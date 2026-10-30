import { useEffect, useState } from "react";
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
        <table>
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
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>{amountLabel(p.selling_price)}</td>
                <td>{p.active ? "Hiển thị" : "Ẩn"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
  const [syncErrors, setSyncErrors] = useState("");
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
  const suggestedPrice = (p: Product) =>
    Math.ceil(
      p.cost_vnd * (1 + (p.markup_percent ?? config.markupPercent ?? 0) / 100),
    );
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Danh mục bán</h2>
          <button
            onClick={() => {
              setProduct(emptyProduct());
              setInventory("");
            }}
          >
            Thêm sản phẩm tự tạo
          </button>
        </div>
        <div className="action-row">
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
          <table>
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
                  <tr key={p.id}>
                    <td>
                      <button
                        onClick={() => {
                          setProduct(p);
                          setInventory("");
                        }}
                      >
                        {p.name}
                      </button>
                      <br />
                      <small>
                        {p.category} · #{p.id}
                      </small>
                    </td>
                    <td>
                      {p.source === "stock" ? "Kho tự tạo" : p.provider_id}
                    </td>
                    <td>
                      {p.source === "provider" ? amountLabel(p.cost_vnd) : "—"}
                    </td>
                    <td>{amountLabel(p.selling_price)}</td>
                    <td>
                      {p.source === "stock"
                        ? `${p.available} có sẵn`
                        : p.in_stock
                          ? "Còn hàng"
                          : "Hết hàng"}{" "}
                      · {p.active ? "Hiện" : "Ẩn"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <p className="muted">
            Chưa có sản phẩm. Thêm sản phẩm tự tạo hoặc chọn từ NCC bên dưới.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Chọn sản phẩm từ nhà cung cấp</h2>
        <div className="action-row">
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
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm NCC</th>
                  <th>Giá nhập VND</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vendorProducts.map((v) => (
                  <tr key={v.provider_product_id}>
                    <td>{v.name}</td>
                    <td>{amountLabel(Math.ceil(v.price_usd * usdRate))}</td>
                    <td>{v.in_stock ? "Còn hàng" : "Hết hàng"}</td>
                    <td>
                      <button
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
                                  ? 0
                                  : suggestedPrice(p),
                            },
                          );
                        }}
                      >
                        {products.some(
                          (p) =>
                            p.provider_id === providerId &&
                            p.provider_product_id === v.provider_product_id,
                        )
                          ? "Chỉnh sản phẩm"
                          : "Đưa vào danh mục"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>
          {product.id
            ? `Chỉnh sản phẩm #${product.id}`
            : product.source === "provider"
              ? "Thêm sản phẩm từ NCC"
              : "Thêm sản phẩm tự tạo"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const saved = await api<{ id: number }>("/api/admin/products", {
                body: {
                  ...product,
                  active: Boolean(product.active),
                  provider_id: product.provider_id ?? undefined,
                  provider_product_id: product.provider_product_id ?? undefined,
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
                          e.target.value === "" ? null : Number(e.target.value),
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
          <label>
            Mô tả
            <textarea
              maxLength={10000}
              value={product.description}
              onChange={(e) =>
                setProduct({ ...product, description: e.target.value })
              }
            />
          </label>
          <div className="action-row">
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(`/api/admin/products/${product.id}/inventory`, {
                  body: {
                    values: inventory
                      .split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  },
                });
                setInventory("");
                await load();
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
            <button>Nhập vào kho</button>
          </form>
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
    </>
  );
}

export function Providers({ run }: { run: Run }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    id: "prodseller",
    name: "",
    base_url: "",
    api_key: "",
    auth_type: "header",
    auth_key_name: "Authorization",
    is_active: true,
  });
  const [rate, setRate] = useState(25500);
  const [categories, setCategories] = useState("");
  const [config, setConfig] = useState<CatalogConfig>({
    markupPercent: null,
    telegramChatId: "",
  });
  const [notice, setNotice] = useState("");
  async function load() {
    const [directory, settings, catalog] = await Promise.all([
      api<{ providers: Provider[]; usd_rate: number }>(
        `${supplierApi}/providers`,
      ),
      api<{ settings: { categories: { name: string; keywords: string[] }[] } }>(
        `${supplierApi}/settings`,
      ),
      api<CatalogConfig>("/api/admin/catalog-config"),
    ]);
    setProviders(directory.providers);
    setRate(directory.usd_rate);
    setConfig(catalog);
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
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Nhà cung cấp</h2>
          <button
            onClick={() => {
              setEditing(false);
              setForm({
                id: "prodseller",
                name: "",
                base_url: "",
                api_key: "",
                auth_type: "header",
                auth_key_name: "Authorization",
                is_active: true,
              });
            }}
          >
            Thêm kết nối
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NCC</th>
                <th>API key</th>
                <th>Số dư</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <br />
                    <small>
                      {p.id} · {p.is_active ? "Đang bật" : "Đã tắt"}
                    </small>
                  </td>
                  <td>{p.api_key_masked || "Chưa cấu hình"}</td>
                  <td>
                    {p.balance ?? "—"} {p.balance_currency}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setEditing(true);
                        setForm({
                          id: p.id,
                          name: p.name,
                          base_url: p.base_url,
                          api_key: "",
                          auth_type: p.auth_type || "header",
                          auth_key_name: p.auth_key_name || "Authorization",
                          is_active: p.is_active,
                        });
                      }}
                    >
                      Chỉnh kết nối
                    </button>
                    <button
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{
                            balance: number;
                            currency: string;
                          }>(
                            `${supplierApi}/providers/${encodeURIComponent(p.id)}/sync-balance`,
                            { body: {} },
                          );
                          setNotice(
                            `${p.name}: ${result.balance} ${result.currency}`,
                          );
                          await load();
                        })
                      }
                    >
                      Cập nhật số dư
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notice && <p role="status">{notice}</p>}
      </section>
      <section className="panel">
        <h2>{editing ? "Chỉnh kết nối NCC" : "Thêm kết nối NCC"}</h2>
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
                onChange={(e) => setForm({ ...form, id: e.target.value })}
              >
                {[
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
                ].map((id) => (
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
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              />
            </label>
            <label>
              API key {editing && "(để trống để giữ nguyên)"}
              <input
                type="password"
                autoComplete="new-password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
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
          </div>
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
          <button className="primary">Lưu kết nối</button>
        </form>
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
      <section className="panel">
        <h2>Cảnh báo Telegram cho quản trị</h2>
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
            Chat ID quản trị (tài khoản hoặc nhóm)
            <input
              pattern="-?[0-9]{1,25}"
              value={config.telegramChatId}
              onChange={(e) =>
                setConfig({ ...config, telegramChatId: e.target.value })
              }
            />
          </label>
          <p className="muted">
            Bot cần được thêm vào nhóm và có quyền gửi tin. Cảnh báo luôn lưu
            trong admin; Telegram gửi qua tác vụ nền.
          </p>
          <button>Lưu nơi nhận cảnh báo</button>
        </form>
      </section>
    </>
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
        <h2>Cần xử lý & đối soát ({alerts.length})</h2>
        <button onClick={() => void run(load)}>Cập nhật cảnh báo</button>
      </div>
      {!alerts.length ? (
        <p className="muted">Không có đơn cần xử lý.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Đơn / sản phẩm</th>
                <th>Nguyên nhân</th>
                <th>Đã giao</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="mono">{a.order_id}</span>
                    <br />
                    {a.name}
                    <br />
                    <small>{timeLabel(a.created_at)}</small>
                  </td>
                  <td>
                    {reasonLabel(a.reason)}
                    {a.purchase_order_id && (
                      <small className="admin-block">
                        Đơn nhập: {a.purchase_order_id}
                      </small>
                    )}
                  </td>
                  <td>
                    {a.delivered_quantity}/{a.quantity}
                  </td>
                  <td>
                    {canResolve && (
                      <button
                        onClick={() => {
                          setSelected(a);
                          setValues("");
                          setReason("");
                          setConfirmed(false);
                        }}
                      >
                        Xử lý
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <form
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
          <h3>
            Xử lý đơn {selected.order_id} · {selected.name}
          </h3>
          <p>
            {reasonLabel(selected.reason)}. Kiểm tra kết quả NCC và lịch sử nhập
            hàng trước khi xử lý.
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
          <div className="action-row">
            <button
              className="primary"
              disabled={selected.status !== "DELIVERED" && !values.trim()}
            >
              {selected.status === "DELIVERED"
                ? "Đóng cảnh báo sau đối soát"
                : "Giao phần còn thiếu"}
            </button>
            <button type="button" onClick={() => setSelected(null)}>
              Đóng
            </button>
          </div>
          {selected.delivered_quantity === 0 && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Tôi đã đối soát lần xử lý này và xác nhận chưa có giao dịch mua
                thành công cần nhận hàng.
              </label>
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
            </>
          )}
        </form>
      )}
    </section>
  );
}

interface SupplierOrder {
  id: string;
  provider_id: string;
  product_name: string;
  quantity: number;
  status: string;
  total_price: number;
  currency: string;
  provider_order_id: string | null;
  delivered_items: string[];
  can_check_status: boolean;
  created_at: string;
}
export function PurchaseOrders({ run }: { run: Run }) {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  async function load(query = "") {
    const [history, directory] = await Promise.all([
      api<{ orders: SupplierOrder[] }>(
        `${supplierApi}/orders?limit=100&search=${encodeURIComponent(query)}`,
      ),
      api<{ providers: Provider[] }>(`${supplierApi}/providers`),
    ]);
    setOrders(history.orders);
    setProviders(directory.providers);
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Đơn nhập nhà cung cấp</h2>
        <button
          onClick={() =>
            void run(async () => {
              await api(`${supplierApi}/orders/sync-all`, { body: {} });
              await load(search);
            })
          }
        >
          Đồng bộ lịch sử NCC
        </button>
      </div>
      <form
        className="action-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => load(search));
        }}
      >
        <input
          aria-label="Tìm đơn nhập"
          value={search}
          placeholder="Tìm đơn nhập…"
          onChange={(e) => setSearch(e.target.value)}
        />
        <button>Tìm</button>
      </form>
      <div className="table-wrap">
        <table>
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
              <tr key={o.id}>
                <td>
                  <button
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{ order: SupplierOrder }>(
                          `${supplierApi}/orders/${encodeURIComponent(o.id)}`,
                        );
                        setSelected(result.order);
                      })
                    }
                  >
                    {o.id}
                  </button>
                  <br />
                  {o.provider_id}
                </td>
                <td>
                  {o.product_name} × {o.quantity}
                </td>
                <td>
                  {o.total_price} {o.currency}
                </td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="admin-detail">
          <h3>Đơn nhập {selected.id}</h3>
          <p>
            NCC: {selected.provider_id} · Mã NCC:{" "}
            {selected.provider_order_id ?? "Chưa có"} · {selected.status}
          </p>
          <pre className="code-block">
            {selected.delivered_items?.join("\n") ||
              "Chưa có dữ liệu giao hàng"}
          </pre>
          <div className="action-row">
            {selected.can_check_status && (
              <button
                onClick={() =>
                  void run(async () => {
                    await api(
                      `${supplierApi}/orders/${encodeURIComponent(selected.id)}/check-status`,
                      { body: {} },
                    );
                    await load();
                    setSelected(null);
                  })
                }
              >
                Kiểm tra trạng thái NCC
              </button>
            )}
            <button onClick={() => setSelected(null)}>Đóng chi tiết</button>
          </div>
        </div>
      )}
      <details>
        <summary>Đặt mua NCC thủ công</summary>
        <p className="muted">
          Đơn khách đã thanh toán được mua tự động. Chỉ dùng mục này để nhập
          hàng chủ động; đơn lỗi hoặc timeout cần đối soát tại cảnh báo trước
          khi mua lại.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const selectedProduct = vendorProducts.find(
                (v) => v.provider_product_id === item,
              );
              if (!selectedProduct) throw new Error("Chọn sản phẩm NCC");
              await api(`${supplierApi}/order`, {
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
              await load();
            });
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
          </div>
          <button className="primary">Đặt mua NCC</button>
        </form>
      </details>
    </section>
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

function MonthlyReport({ run }: { run: Run }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [months, setMonths] = useState<
    {
      month: number;
      label: string;
      revenue: number;
      totalExpense: number;
      profit: number;
    }[]
  >([]);
  async function load(reportYear: number) {
    setMonths(
      (
        await api<{ months: typeof months }>(
          `${supplierApi}/reports/monthly?year=${reportYear}`,
        )
      ).months,
    );
  }
  useEffect(() => {
    void run(() => load(new Date().getFullYear()));
  }, [run]);
  return (
    <section className="panel">
      <details>
        <summary>Báo cáo giao dịch theo tháng</summary>
        <form
          className="action-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load(year));
          }}
        >
          <label>
            Năm báo cáo
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <button>Xem báo cáo năm</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Doanh thu</th>
                <th>Chi phí</th>
                <th>Lợi nhuận</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{m.label}</td>
                  <td>{amountLabel(m.revenue)}</td>
                  <td>{amountLabel(m.totalExpense)}</td>
                  <td>{amountLabel(m.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
export function BusinessFinance({
  run,
  warrantyOnly = false,
}: {
  run: Run;
  warrantyOnly?: boolean;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [automatic, setAutomatic] = useState<Record<string, number>>({});
  const [form, setForm] = useState(emptyTransaction);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  async function load(query = "", onlyWarranty = false) {
    if (onlyWarranty) {
      setTransactions(
        (
          await api<{ list: TransactionResponse[] }>(
            `${supplierApi}/warranty/lookup?q=${encodeURIComponent(query)}`,
          )
        ).list.map(transactionRow),
      );
      return;
    }
    const [data, report, commerce] = await Promise.all([
      api<{ transactions: TransactionResponse[] }>(
        `${supplierApi}/transactions?q=${encodeURIComponent(query)}`,
      ),
      api<{ summary: Record<string, number> }>(
        `${supplierApi}/reports/summary`,
      ),
      api<Record<string, number>>("/api/admin/commerce-report"),
    ]);
    setTransactions(data.transactions.map(transactionRow));
    setSummary(report.summary);
    setAutomatic(commerce);
  }
  useEffect(() => {
    void run(() => load("", warrantyOnly));
  }, [run, warrantyOnly]);
  return (
    <>
      {!warrantyOnly && <MonthlyReport run={run} />}
      {!warrantyOnly && (
        <>
          <section className="panel">
            <h2>Doanh thu & lợi nhuận cửa hàng</h2>
            <p className="muted">
              Doanh thu đã thanh toán và giá vốn các phần hàng đã giao. Chi phí
              đơn NCC chưa rõ kết quả được đối soát riêng.
            </p>
            <div className="metric-grid">
              {[
                ["Doanh thu đã thu", automatic.revenue],
                ["Giá vốn đã giao", automatic.cost],
                ["Lợi nhuận phần đã giao", automatic.profit],
                ["Đơn cần xử lý", automatic.review],
              ].map(([label, value]) => (
                <div className="metric" key={String(label)}>
                  <span>{label}</span>
                  <strong>
                    {label === "Đơn cần xử lý"
                      ? (value ?? 0)
                      : amountLabel(Number(value) || 0)}
                  </strong>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Giao dịch nhập tay & chi phí</h2>
            <div className="metric-grid">
              {[
                ["Doanh thu nhập tay", summary.totalRevenue],
                ["Chi phí", summary.totalExpense],
                ["Lợi nhuận ròng", summary.netProfit],
              ].map(([label, value]) => (
                <div className="metric" key={String(label)}>
                  <span>{label}</span>
                  <strong>{amountLabel(Number(value) || 0)}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>{warrantyOnly ? "Tra cứu & xử lý bảo hành" : "Sổ giao dịch"}</h2>
          <button
            onClick={() => {
              setSelected(null);
              setForm(emptyTransaction());
            }}
          >
            Ghi giao dịch mới
          </button>
        </div>
        <form
          className="action-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load(search, warrantyOnly));
          }}
        >
          <input
            aria-label="Tìm giao dịch bảo hành"
            placeholder="Tên sản phẩm, khách hàng…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button>Tìm</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày / sản phẩm</th>
                <th>Khách</th>
                <th>Giá vốn / bán</th>
                <th>Bảo hành</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.date}
                    <br />
                    {t.product_name} · {t.type}
                  </td>
                  <td>{t.customer_info}</td>
                  <td>
                    {amountLabel(t.cost_price)} / {amountLabel(t.sale_price)}
                  </td>
                  <td>
                    {t.warranty_status}
                    <br />
                    {t.warranty_expire_date ?? "—"}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setSelected(t.id);
                        setForm({ ...emptyTransaction(), ...t });
                      }}
                    >
                      Chỉnh / bảo hành
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>
          {selected
            ? `Chỉnh giao dịch #${selected}`
            : "Ghi bán hàng / nhập hàng / chi phí"}
        </h2>
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
              await load(search, warrantyOnly);
            });
          }}
        >
          <div className="form-grid">
            <label>
              Loại
              <select
                value={form.type}
                disabled={selected !== null}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
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
                onChange={(e) => setForm({ ...form, date: e.target.value })}
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
                  await load(search, warrantyOnly);
                })
              }
            >
              Ẩn giao dịch này
            </button>
          )}
        </form>
      </section>
    </>
  );
}
