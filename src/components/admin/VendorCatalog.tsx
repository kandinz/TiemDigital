import { useEffect, useMemo, useState } from "react";
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
  };
}

interface Provider { id: string; name: string; is_active: boolean }
type VendorRow = VendorSelection & { providerName: string; priceVnd: number };

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

  async function load() {
    const directory = await api<{ providers: Provider[]; usd_rate: number }>("/api/admin/mmo/providers");
    setProviders(directory.providers);
    setRate(directory.usd_rate);
    const active = directory.providers.filter((provider) => provider.is_active);
    const next: VendorRow[] = [];
    const errors: string[] = [];
    for (let offset = 0; offset < active.length; offset += 4) {
      const batch = await Promise.allSettled(active.slice(offset, offset + 4).map(async (provider) => {
        const result = await api<{ products: VendorSelection["product"][]; provider_errors?: { message: string }[] }>(`/api/admin/mmo/products?provider_id=${encodeURIComponent(provider.id)}`);
        if (result.provider_errors?.length) throw new Error(result.provider_errors[0].message);
        return result.products.map((product) => ({ providerId: provider.id, providerName: provider.name, product, priceVnd: Math.ceil(product.price_usd * directory.usd_rate) }));
      }));
      batch.forEach((result, index) => {
        if (result.status === "fulfilled") next.push(...result.value);
        else errors.push(active[offset + index].name);
      });
    }
    setRows(next);
    setFailures(errors);
  }

  useEffect(() => { void run(load); }, [run]);

  const categories = useMemo(() => [...new Set(rows.map((row) => row.product.category || "Khác"))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const visible = rows.filter((row) =>
    (!providerFilter || row.providerId === providerFilter) &&
    (!categoryFilter || (row.product.category || "Khác") === categoryFilter) &&
    (!stockOnly || row.product.in_stock) &&
    (!maxPrice || row.priceVnd <= Number(maxPrice)) &&
    `${row.product.name} ${row.providerName} ${row.product.category || ""} ${row.product.provider_product_id}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );

  return <section className="panel">
    <div className="panel-heading"><h2>Sản phẩm nhà cung cấp <small className="muted">{visible.length}/{rows.length}</small></h2><button onClick={() => void run(load)}>Tải lại bảng giá</button></div>
    <div className="admin-toolbar vendor-filters">
      <input aria-label="Tìm sản phẩm nhà cung cấp" placeholder="Tìm tên, mã, nhà cung cấp…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Lọc nhà cung cấp" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="">Tất cả NCC</option>{providers.filter((provider) => provider.is_active).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
      <select aria-label="Lọc danh mục" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Tất cả danh mục</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
      <input aria-label="Giá nhập tối đa VND" type="number" min="0" placeholder="Giá tối đa (₫)" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
      <label className="inline-check"><input type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} /> Còn hàng</label>
    </div>
    {failures.length > 0 && <p role="alert" className="notice error">Không tải được: {failures.join(", ")}. Có thể thử tải lại.</p>}
    <div className="table-wrap"><SmartTable><thead><tr><th>Sản phẩm</th><th>Nhà cung cấp</th><th>Danh mục</th><th>Giá nhập</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visible.map((row) => <tr key={`${row.providerId}:${row.product.provider_product_id}`}><td><strong>{row.product.name}</strong><br /><small className="muted mono">{row.product.provider_product_id}</small></td><td>{row.providerName}</td><td>{row.product.category || "Khác"}</td><td><strong>{row.priceVnd.toLocaleString("vi-VN")} ₫</strong><br /><small className="muted">{row.product.price_usd} USD · {rate.toLocaleString("vi-VN")} ₫/USD</small></td><td><span className={row.product.in_stock ? "status good" : "status"}>{row.product.in_stock ? "Còn hàng" : "Hết hàng"}</span></td><td><button className="primary" disabled={!row.product.in_stock} onClick={() => onBuy({ providerId: row.providerId, product: row.product })}>Chọn mua</button></td></tr>)}</tbody></SmartTable></div>
    {rows.length === 0 && failures.length === 0 && <p className="muted">Chưa có sản phẩm từ nhà cung cấp đang bật.</p>}
  </section>;
}
