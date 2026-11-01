import { useEffect, useRef, useState } from "react";
import { api } from "../../services/platform";
import type { VendorRow } from "./VendorCatalog";

type Draft = { row: VendorRow; name: string; description: string; category: string; image: string; price: string; status: "ready" | "done" | "failed" | "unknown"; message?: string };
type Linked = { provider_id: string | null; provider_product_id: string | null };

/** Review a batch without retrying an ambiguous write. */
export function VendorPublish({ rows, onClose }: { rows: VendorRow[]; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api<{ markupPercent: number | null }>("/api/admin/catalog-config"), api<{ products: Linked[] }>("/api/admin/products")]).then(([config, catalog]) => {
      if (!live) return;
      setDrafts(rows.map(row => {
        const linked = catalog.products.some(p => p.provider_id === row.providerId && p.provider_product_id === row.product.provider_product_id);
        const key = `vendor-publish:${row.providerId}:${row.product.provider_product_id}`;
        const pending = sessionStorage.getItem(key) === "pending";
        return { row, name: row.product.name, description: row.product.extra?.description ?? "", category: row.product.category || "Khác", image: row.product.extra?.image_url ?? "", price: config.markupPercent == null ? "" : String(Math.ceil(row.priceVnd * (1 + config.markupPercent / 100))), status: linked ? "done" : pending ? "unknown" : "ready", message: linked ? "Đã liên kết" : pending ? "Kết quả chưa rõ, cần đối soát trước khi tạo lại." : undefined };
      }));
    }).catch(() => { if (live) setError("Không tải được cấu hình giá hoặc danh mục bán. Hãy thử lại."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [rows]);
  function update(index: number, change: Partial<Draft>) { setDrafts(items => items.map((item, i) => i === index ? { ...item, ...change } : item)); }
  async function publish() {
    if (busy.current) return;
    if (drafts.some(d => (d.status === "ready" || d.status === "failed") && (!d.name.trim() || !d.category.trim() || !Number.isSafeInteger(Number(d.price)) || Number(d.price) <= 0))) { setError("Nhập tên, danh mục và giá bán hợp lệ cho từng sản phẩm."); return; }
    busy.current = true; setSaving(true); setError(""); setPublishedCount(null);
    let published = 0;
    for (const [index, draft] of drafts.entries()) {
      if (draft.status !== "ready" && draft.status !== "failed") continue;
      const { row } = draft;
      const key = `vendor-publish:${row.providerId}:${row.product.provider_product_id}`;
      try {
        const catalog = await api<{ products: Linked[] }>("/api/admin/products");
        if (catalog.products.some(p => p.provider_id === row.providerId && p.provider_product_id === row.product.provider_product_id)) { update(index, { status: "done", message: "Đã liên kết" }); continue; }
      } catch { update(index, { status: "failed", message: "Không kiểm tra được danh mục; chưa tạo sản phẩm." }); continue; }
      try {
        sessionStorage.setItem(key, "pending");
        await api("/api/admin/products", { body: { name: draft.name.trim(), description: draft.description, category: draft.category.trim(), image_url: draft.image, selling_price: Number(draft.price), in_stock: row.product.in_stock, active: true, source: "provider", provider_id: row.providerId, provider_product_id: row.product.provider_product_id } });
        sessionStorage.removeItem(key); published++; update(index, { status: "done", message: "Đã lên kệ" });
      } catch (cause) {
        const status = (cause as { status?: number }).status;
        if (status && [400, 401, 403, 404, 409, 422].includes(status)) { sessionStorage.removeItem(key); update(index, { status: "failed", message: cause instanceof Error ? cause.message : "Không tạo được sản phẩm" }); }
        else update(index, { status: "unknown", message: "Kết quả chưa rõ; kiểm tra danh mục trước khi thao tác tiếp." });
      }
    }
    if (published > 0) setPublishedCount(published);
    busy.current = false; setSaving(false);
  }
  return <section className="panel" aria-label="Kiểm tra sản phẩm lên kệ">
    <h3>Kiểm tra sản phẩm trước khi lên kệ</h3>
    {loading && <p>Đang tải cấu hình và kiểm tra sản phẩm đã liên kết…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {drafts.map((draft, index) => <fieldset key={`${draft.row.providerId}:${draft.row.product.provider_product_id}`} disabled={saving || draft.status === "done" || draft.status === "unknown"}>
      <legend>{draft.row.product.name} · {draft.row.providerName}</legend>
      <label>Tên<input aria-label={`Tên ${draft.row.product.name}`} value={draft.name} onChange={e => update(index, { name: e.target.value })} /></label>
      <label>Danh mục<input aria-label={`Danh mục ${draft.row.product.name}`} value={draft.category} onChange={e => update(index, { category: e.target.value })} /></label>
      <label>Giá bán<input type="number" min="1" aria-label={`Giá bán ${draft.row.product.name}`} value={draft.price} onChange={e => update(index, { price: e.target.value })} /></label>
      <label>Ảnh<input type="url" aria-label={`Ảnh ${draft.row.product.name}`} value={draft.image} onChange={e => update(index, { image: e.target.value })} /></label>
      <label>Mô tả<textarea aria-label={`Mô tả ${draft.row.product.name}`} value={draft.description} onChange={e => update(index, { description: e.target.value })} /></label>
      {draft.message && <p role="status">{draft.message}</p>}
    </fieldset>)}
    {publishedCount !== null && <p role="status">Đã lên kệ {publishedCount} sản phẩm</p>}
    <button type="button" disabled={saving || loading || !drafts.some(d => d.status === "ready" || d.status === "failed")} onClick={() => void publish()}>Xác nhận lên kệ</button>
    <button type="button" disabled={saving} onClick={onClose}>Đóng</button>
  </section>;
}
