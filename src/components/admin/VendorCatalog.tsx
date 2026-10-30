import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { api } from "../../services/platform";
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
    extra?: { stock?: number | string | null; available_stock?: number | string | null; description?: string; image_url?: string };
  };
}

interface Provider { id: string; name: string; is_active: boolean }
type VendorRow = VendorSelection & { providerName: string; priceVnd: number };
interface VendorProgress { id: string; name: string; status: "pending" | "loading" | "done" | "error"; count: number }

function stockQuantity(product: VendorSelection["product"]) {
  const raw = product.extra?.stock ?? product.extra?.available_stock;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const quantity = Number(raw);
    if (Number.isSafeInteger(quantity) && quantity >= 0) return quantity;
  }
  return product.in_stock ? null : 0;
}

export function VendorCatalog({ run, onBuy }: { run: Run; onBuy: (selection: VendorSelection) => void }) {
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
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const current = ++loadId.current;
    setLoading(true);
    setRows([]);
    setFailures([]);
    setProgress([]);
    try {
      const directory = await api<{ providers: Provider[]; usd_rate: number }>("/api/admin/mmo/providers");
      if (current !== loadId.current) return;
      setProviders(directory.providers);
      setRate(directory.usd_rate);
      const active = directory.providers.filter((provider) => provider.is_active);
      setProgress(active.map((provider) => ({ id: provider.id, name: provider.name, status: "pending", count: 0 })));
      const pending = [...active];
      await Promise.all(Array.from({ length: Math.min(4, active.length) }, async () => {
        while (pending.length && current === loadId.current) {
          const provider = pending.shift()!;
          setProgress((previous) => previous.map((item) => item.id === provider.id ? { ...item, status: "loading" } : item));
          try {
            const result = await api<{ products: VendorSelection["product"][]; provider_errors?: { message: string }[] }>(`/api/admin/mmo/products?provider_id=${encodeURIComponent(provider.id)}`);
            if (result.provider_errors?.length) throw new Error(result.provider_errors[0].message);
            if (current !== loadId.current) return;
            setRows((previous) => [...previous, ...result.products.map((product) => ({ providerId: provider.id, providerName: provider.name, product, priceVnd: Math.ceil(product.price_usd * directory.usd_rate) }))]);
            setProgress((previous) => previous.map((item) => item.id === provider.id ? { ...item, status: "done", count: result.products.length } : item));
          } catch {
            if (current !== loadId.current) return;
            setFailures((previous) => [...previous, provider.name]);
            setProgress((previous) => previous.map((item) => item.id === provider.id ? { ...item, status: "error" } : item));
          }
        }
      }));
    } finally {
      if (current === loadId.current) setLoading(false);
    }
  }, []);

  const cancelLoad = useCallback(() => { loadId.current++; }, []);
  useEffect(() => { void run(load); return cancelLoad; }, [run, load, cancelLoad]);

  const categories = useMemo(() => [...new Set(rows.map((row) => row.product.category || "Khác"))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const visible = rows.filter((row) =>
    (!providerFilter || row.providerId === providerFilter) &&
    (!categoryFilter || (row.product.category || "Khác") === categoryFilter) &&
    (!stockOnly || (row.product.in_stock && stockQuantity(row.product) !== 0)) &&
    (!maxPrice || row.priceVnd <= Number(maxPrice)) &&
    `${row.product.name} ${row.providerName} ${row.product.category || ""} ${row.product.provider_product_id}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  const completed = progress.filter((item) => item.status === "done" || item.status === "error").length;

  return <section className="panel">
    <div className="panel-heading"><h2>Sản phẩm nhà cung cấp <small className="muted">{visible.length}/{rows.length}</small></h2><button disabled={loading} onClick={() => void run(load)}>{loading && <LoaderCircle size={15} className="vendor-spinner" aria-hidden="true" />}{loading ? "Đang tải bảng giá…" : "Tải lại bảng giá"}</button></div>
    {(loading || progress.length > 0) && <div className="vendor-load-progress">
      <div className="vendor-load-summary" role="status" aria-live="polite">
        {loading ? <LoaderCircle size={16} className="vendor-spinner" aria-hidden="true" /> : failures.length ? <CircleAlert size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
        <span>{progress.length ? `${loading ? "Đang tải" : "Hoàn tất"} · ${completed}/${progress.length} NCC · ${rows.length} sản phẩm${failures.length ? ` · ${failures.length} NCC lỗi` : ""}` : "Đang tải danh sách nhà cung cấp…"}</span>
      </div>
      {progress.length > 0 && <><progress aria-label="Tiến trình tải nhà cung cấp" max={progress.length} value={completed} /><ul className="vendor-load-list">{progress.map((item) => <li key={item.id} className={`vendor-load-item ${item.status}`}>
        {item.status === "loading" ? <LoaderCircle size={13} className="vendor-spinner" aria-hidden="true" /> : item.status === "done" ? <CheckCircle2 size={13} aria-hidden="true" /> : item.status === "error" ? <CircleAlert size={13} aria-hidden="true" /> : null}
        {item.name}<span>{item.status === "done" ? `${item.count} SP` : item.status === "loading" ? "Đang tải" : item.status === "error" ? "Lỗi" : "Chờ tải"}</span>
      </li>)}</ul></>}
    </div>}
    <div className="admin-toolbar vendor-filters">
      <input aria-label="Tìm sản phẩm nhà cung cấp" placeholder="Tìm tên, mã, nhà cung cấp…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Lọc nhà cung cấp" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="">Tất cả NCC</option>{providers.filter((provider) => provider.is_active).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
      <select aria-label="Lọc danh mục" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Tất cả danh mục</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
      <input aria-label="Giá nhập tối đa VND" type="number" min="0" placeholder="Giá tối đa (₫)" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
      <label className="inline-check"><input type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} /> Còn hàng</label>
    </div>
    {failures.length > 0 && <p role="alert" className="notice error">Không tải được: {failures.join(", ")}. Có thể thử tải lại.</p>}
    {(rows.length > 0 || !loading) && <div className="table-wrap" aria-busy={loading}><SmartTable><thead><tr><th>Sản phẩm</th><th>Nhà cung cấp</th><th>Danh mục</th><th>Giá nhập</th><th>Số lượng tồn kho</th><th>Thao tác</th></tr></thead><tbody>{visible.map((row) => <tr key={`${row.providerId}:${row.product.provider_product_id}`}><td><strong>{row.product.name}</strong><br /><small className="muted mono">{row.product.provider_product_id}</small></td><td>{row.providerName}</td><td>{row.product.category || "Khác"}</td><td><strong>{row.priceVnd.toLocaleString("vi-VN")} ₫</strong><br /><small className="muted">{row.product.price_usd} USD · {rate.toLocaleString("vi-VN")} ₫/USD</small></td><td>{stockQuantity(row.product) === null ? <span className="muted">Không cung cấp</span> : <strong className="mono">{stockQuantity(row.product)?.toLocaleString("vi-VN")}</strong>}</td><td><button className="primary" disabled={!row.product.in_stock || stockQuantity(row.product) === 0} onClick={() => onBuy({ providerId: row.providerId, product: row.product })}>Chọn mua</button></td></tr>)}</tbody></SmartTable></div>}
    {!loading && rows.length === 0 && failures.length === 0 && <p className="muted">Chưa có sản phẩm từ nhà cung cấp đang bật.</p>}
  </section>;
}
