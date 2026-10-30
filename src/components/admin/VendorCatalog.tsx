import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { api } from "../../services/platform";
import { ProductDescription } from "../ProductDescription";
import { PurchaseOrders } from "./CommerceAdmin";
import { DropdownChipFilter } from "./DropdownChipFilter";
import { SmartTable } from "./SmartTable";

type Run = (task: () => Promise<void>) => Promise<void>;

export interface VendorSelection {
  providerId: string;
  product: {
    provider_product_id: string;
    name: string;
    price_usd: number;
    in_stock: boolean;
    category?: string;
    extra?: {
      stock?: number | string | null;
      available_stock?: number | string | null;
      description?: string;
      image_url?: string;
    };
  };
}

interface Provider {
  id: string;
  name: string;
  is_active: boolean;
}

type VendorRow = VendorSelection & { providerName: string; priceVnd: number };

interface VendorProgress {
  id: string;
  name: string;
  status: "pending" | "loading" | "done" | "error";
  count: number;
}

/**
 * Xác định số lượng tồn kho của sản phẩm nhà cung cấp hoặc trả về null nếu không công bố số lượng.
 */
function stockQuantity(product: VendorSelection["product"]) {
  const raw = product.extra?.stock ?? product.extra?.available_stock;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const quantity = Number(raw);
    if (Number.isSafeInteger(quantity) && quantity >= 0) return quantity;
  }
  return product.in_stock ? null : 0;
}

/**
 * Hiển thị danh mục sản phẩm nhà cung cấp, chi tiết mô tả sản phẩm và tích hợp mua hàng / quản lý đơn nhập NCC.
 */
export function VendorCatalog({
  run,
  ownerId,
  onBuy,
}: {
  run: Run;
  ownerId?: string;
  onBuy?: (selection: VendorSelection) => void;
}) {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rate, setRate] = useState(25500);
  const [failures, setFailures] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockOnly, setStockOnly] = useState(true);
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<VendorProgress[]>([]);
  const [selectedRow, setSelectedRow] = useState<VendorRow | null>(null);
  const [purchaseSelection, setPurchaseSelection] = useState<VendorSelection | null>(null);
  const [purchaseTrigger, setPurchaseTrigger] = useState(0);
  const loadId = useRef(0);
  const detailRef = useRef<HTMLElement | null>(null);
  const purchaseSectionRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const current = ++loadId.current;
    setLoading(true);
    setRows([]);
    setFailures([]);
    setProgress([]);
    try {
      const directory = await api<{ providers: Provider[]; usd_rate: number }>(
        "/api/admin/mmo/providers",
      );
      if (current !== loadId.current) return;
      setProviders(directory.providers);
      setRate(directory.usd_rate);
      const active = directory.providers.filter((provider) => provider.is_active);
      setProgress(
        active.map((provider) => ({
          id: provider.id,
          name: provider.name,
          status: "pending",
          count: 0,
        })),
      );
      const pending = [...active];
      await Promise.all(
        Array.from({ length: Math.min(4, active.length) }, async () => {
          while (pending.length && current === loadId.current) {
            const provider = pending.shift()!;
            setProgress((previous) =>
              previous.map((item) =>
                item.id === provider.id ? { ...item, status: "loading" } : item,
              ),
            );
            try {
              const result = await api<{
                products: VendorSelection["product"][];
                provider_errors?: { message: string }[];
              }>(
                `/api/admin/mmo/products?provider_id=${encodeURIComponent(provider.id)}`,
              );
              if (result.provider_errors?.length)
                throw new Error(result.provider_errors[0].message);
              if (current !== loadId.current) return;
              setRows((previous) => [
                ...previous,
                ...result.products.map((product) => ({
                  providerId: provider.id,
                  providerName: provider.name,
                  product,
                  priceVnd: Math.ceil(product.price_usd * directory.usd_rate),
                })),
              ]);
              setProgress((previous) =>
                previous.map((item) =>
                  item.id === provider.id
                    ? { ...item, status: "done", count: result.products.length }
                    : item,
                ),
              );
            } catch {
              if (current !== loadId.current) return;
              setFailures((previous) => [...previous, provider.name]);
              setProgress((previous) =>
                previous.map((item) =>
                  item.id === provider.id ? { ...item, status: "error" } : item,
                ),
              );
            }
          }
        }),
      );
    } finally {
      if (current === loadId.current) setLoading(false);
    }
  }, []);

  const cancelLoad = useCallback(() => {
    loadId.current++;
  }, []);
  useEffect(() => {
    void run(load);
    return cancelLoad;
  }, [run, load, cancelLoad]);

  const categories = useMemo(
    () =>
      [...new Set(rows.map((row) => row.product.category || "Khác"))].sort(
        (a, b) => a.localeCompare(b, "vi"),
      ),
    [rows],
  );

  const providerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.providerId, (counts.get(row.providerId) ?? 0) + 1);
    }
    return providers
      .filter((provider) => provider.is_active)
      .map((provider) => ({
        value: provider.id,
        label: provider.name,
        count: counts.get(provider.id) ?? 0,
      }));
  }, [providers, rows]);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const cat = row.product.category || "Khác";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return categories.map((category) => ({
      value: category,
      label: category,
      count: counts.get(category) ?? 0,
    }));
  }, [categories, rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        (!providerFilter || row.providerId === providerFilter) &&
        (!categoryFilter || (row.product.category || "Khác") === categoryFilter) &&
        (!stockOnly ||
          (row.product.in_stock && stockQuantity(row.product) !== 0)) &&
        (!maxPrice || row.priceVnd <= Number(maxPrice)) &&
        `${row.product.name} ${row.providerName} ${row.product.category || ""} ${row.product.provider_product_id} ${row.product.extra?.description || ""}`
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi")),
    );
    return [...filtered].sort((a, b) => {
      const aStock = a.product.in_stock && stockQuantity(a.product) !== 0 ? 1 : 0;
      const bStock = b.product.in_stock && stockQuantity(b.product) !== 0 ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock;
      if (a.priceVnd !== b.priceVnd) return a.priceVnd - b.priceVnd;
      return a.product.name.localeCompare(b.product.name, "vi");
    });
  }, [rows, providerFilter, categoryFilter, stockOnly, maxPrice, search]);

  const completed = progress.filter(
    (item) => item.status === "done" || item.status === "error",
  ).length;

  function triggerBuy(selection: VendorSelection) {
    setPurchaseSelection(selection);
    setPurchaseTrigger((prev) => prev + 1);
    onBuy?.(selection);
    requestAnimationFrame(() => {
      purchaseSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <>
      <div className={selectedRow ? "admin-split-grid" : ""}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Sản phẩm nhà cung cấp{" "}
                <small className="muted">
                  {visible.length}/{rows.length}
                </small>
              </h2>
              <p className="muted">
                Mặc định ưu tiên sản phẩm còn hàng giá thấp nhất. Bấm vào dòng sản
                phẩm để xem mô tả chi tiết và mua nhanh từ NCC.
              </p>
            </div>
            <button disabled={loading} onClick={() => void run(load)}>
              {loading && (
                <LoaderCircle
                  size={15}
                  className="vendor-spinner"
                  aria-hidden="true"
                />
              )}
              {loading ? "Đang tải bảng giá…" : "Tải lại bảng giá"}
            </button>
          </div>
          {(loading || progress.length > 0) && (
            <div className="vendor-load-progress">
              <div className="vendor-load-summary" role="status" aria-live="polite">
                {loading ? (
                  <LoaderCircle
                    size={16}
                    className="vendor-spinner"
                    aria-hidden="true"
                  />
                ) : failures.length ? (
                  <CircleAlert size={16} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={16} aria-hidden="true" />
                )}
                <span>
                  {progress.length
                    ? `${loading ? "Đang tải" : "Hoàn tất"} · ${completed}/${progress.length} NCC · ${rows.length} sản phẩm${failures.length ? ` · ${failures.length} NCC lỗi` : ""}`
                    : "Đang tải danh sách nhà cung cấp…"}
                </span>
              </div>
              {progress.length > 0 && (
                <>
                  <progress
                    aria-label="Tiến trình tải nhà cung cấp"
                    max={progress.length}
                    value={completed}
                  />
                  <ul className="vendor-load-list">
                    {progress.map((item) => (
                      <li
                        key={item.id}
                        className={`vendor-load-item ${item.status}`}
                      >
                        {item.status === "loading" ? (
                          <LoaderCircle
                            size={13}
                            className="vendor-spinner"
                            aria-hidden="true"
                          />
                        ) : item.status === "done" ? (
                          <CheckCircle2 size={13} aria-hidden="true" />
                        ) : item.status === "error" ? (
                          <CircleAlert size={13} aria-hidden="true" />
                        ) : null}
                        {item.name}
                        <span>
                          {item.status === "done"
                            ? `${item.count} SP`
                            : item.status === "loading"
                              ? "Đang tải"
                              : item.status === "error"
                                ? "Lỗi"
                                : "Chờ tải"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="admin-toolbar vendor-filters">
            <input
              aria-label="Tìm sản phẩm nhà cung cấp"
              placeholder="Tìm tên, mã, mô tả, nhà cung cấp…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DropdownChipFilter
              label="Lọc nhà cung cấp"
              value={providerFilter}
              allLabel="Tất cả NCC"
              options={providerOptions}
              onChange={setProviderFilter}
            />
            <DropdownChipFilter
              label="Lọc danh mục"
              value={categoryFilter}
              allLabel="Tất cả danh mục"
              options={categoryOptions}
              onChange={setCategoryFilter}
            />
            <input
              aria-label="Giá nhập tối đa VND"
              type="number"
              min="0"
              placeholder="Giá tối đa (₫)"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            />
            <label className="inline-check">
              <input
                type="checkbox"
                checked={stockOnly}
                onChange={(event) => setStockOnly(event.target.checked)}
              />{" "}
              Còn hàng
            </label>
          </div>
          {failures.length > 0 && (
            <p role="alert" className="notice error">
              Không tải được: {failures.join(", ")}. Có thể thử tải lại.
            </p>
          )}
          {(rows.length > 0 || !loading) && (
            <div className="table-wrap" aria-busy={loading}>
              <SmartTable>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Nhà cung cấp</th>
                    <th>Danh mục</th>
                    <th>Giá nhập</th>
                    <th>Số lượng tồn kho</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const rowKey = `${row.providerId}:${row.product.provider_product_id}`;
                    const isSelected =
                      selectedRow &&
                      `${selectedRow.providerId}:${selectedRow.product.provider_product_id}` ===
                        rowKey;
                    const availableStock = stockQuantity(row.product);
                    const inStock = row.product.in_stock && availableStock !== 0;
                    return (
                      <tr
                        key={rowKey}
                        className={`clickable-row ${isSelected ? "selected-row" : ""}`}
                        onClick={() => {
                          setSelectedRow(row);
                          requestAnimationFrame(() => {
                            detailRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            });
                          });
                        }}
                      >
                        <td>
                          <strong>{row.product.name}</strong>
                          <br />
                          <small className="muted mono">
                            {row.product.provider_product_id}
                          </small>
                          {row.product.extra?.description && (
                            <>
                              <br />
                              <small className="row-hint vendor-desc-snippet">
                                {row.product.extra.description.slice(0, 90)}
                                {row.product.extra.description.length > 90
                                  ? "…"
                                  : ""}
                              </small>
                            </>
                          )}
                        </td>
                        <td>{row.providerName}</td>
                        <td>{row.product.category || "Khác"}</td>
                        <td>
                          <strong>
                            {row.priceVnd.toLocaleString("vi-VN")} ₫
                          </strong>
                          <br />
                          <small className="muted">
                            {row.product.price_usd} USD ·{" "}
                            {rate.toLocaleString("vi-VN")} ₫/USD
                          </small>
                        </td>
                        <td>
                          {availableStock === null ? (
                            <span className="status good">Còn hàng</span>
                          ) : availableStock > 0 ? (
                            <strong className="mono">
                              {availableStock.toLocaleString("vi-VN")}
                            </strong>
                          ) : (
                            <span className="status">Hết hàng</span>
                          )}
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <button
                            className="primary"
                            disabled={!inStock}
                            onClick={() =>
                              triggerBuy({
                                providerId: row.providerId,
                                product: row.product,
                              })
                            }
                          >
                            Chọn mua
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </SmartTable>
            </div>
          )}
          {!loading && rows.length === 0 && failures.length === 0 && (
            <p className="muted">
              Chưa có sản phẩm từ nhà cung cấp đang bật.
            </p>
          )}
        </section>

        {selectedRow && (
          <aside
            className="admin-sticky-pane admin-detail-pane is-open"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelectedRow(null);
            }}
          >
            <section
              className="panel panel-focus-target"
              ref={detailRef}
              aria-label="Chi tiết sản phẩm nhà cung cấp"
            >
              <div className="panel-heading">
                <h3>Chi tiết sản phẩm NCC</h3>
                <button type="button" onClick={() => setSelectedRow(null)}>
                  Đóng
                </button>
              </div>
              <div className="vendor-detail-header">
                <strong>{selectedRow.product.name}</strong>
                <span
                  className={
                    selectedRow.product.in_stock &&
                    stockQuantity(selectedRow.product) !== 0
                      ? "status good"
                      : "status"
                  }
                >
                  {selectedRow.product.in_stock &&
                  stockQuantity(selectedRow.product) !== 0
                    ? "Còn hàng"
                    : "Hết hàng"}
                </span>
              </div>
              <div className="admin-kv-grid">
                <div className="admin-kv-item">
                  <small>Nhà cung cấp</small>
                  <strong>{selectedRow.providerName}</strong>
                </div>
                <div className="admin-kv-item">
                  <small>Mã SP phía NCC</small>
                  <strong className="mono">
                    {selectedRow.product.provider_product_id}
                  </strong>
                </div>
                <div className="admin-kv-item">
                  <small>Danh mục</small>
                  <strong>{selectedRow.product.category || "Khác"}</strong>
                </div>
                <div className="admin-kv-item">
                  <small>Tồn kho NCC</small>
                  <strong>
                    {stockQuantity(selectedRow.product) === null
                      ? "Không giới hạn"
                      : stockQuantity(selectedRow.product)?.toLocaleString(
                          "vi-VN",
                        )}
                  </strong>
                </div>
                <div className="admin-kv-item">
                  <small>Giá nhập VND</small>
                  <strong className="positive">
                    {selectedRow.priceVnd.toLocaleString("vi-VN")} ₫
                  </strong>
                </div>
                <div className="admin-kv-item">
                  <small>Giá gốc USD</small>
                  <strong>{selectedRow.product.price_usd} USD</strong>
                </div>
              </div>
              <div className="admin-detail vendor-description-box">
                <strong>Mô tả sản phẩm:</strong>
                {selectedRow.product.extra?.description?.trim() ? (
                  <ProductDescription
                    text={selectedRow.product.extra.description}
                  />
                ) : (
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Nhà cung cấp chưa bổ sung mô tả chi tiết cho sản phẩm này.
                  </p>
                )}
              </div>
              <div className="action-row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    !selectedRow.product.in_stock ||
                    stockQuantity(selectedRow.product) === 0
                  }
                  onClick={() =>
                    triggerBuy({
                      providerId: selectedRow.providerId,
                      product: selectedRow.product,
                    })
                  }
                >
                  Chọn mua sản phẩm này
                </button>
              </div>
            </section>
          </aside>
        )}
      </div>

      {ownerId && (
        <div ref={purchaseSectionRef}>
          <PurchaseOrders
            key={
              purchaseSelection
                ? `${purchaseSelection.providerId}:${purchaseSelection.product.provider_product_id}:${purchaseTrigger}`
                : "default-purchases"
            }
            run={run}
            ownerId={ownerId}
            initialSelection={purchaseSelection}
          />
        </div>
      )}
    </>
  );
}
