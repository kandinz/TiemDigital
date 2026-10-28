import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  amountLabel,
  timeLabel,
  paymentLabel,
  type PageBlock,
  type PlatformOrder,
} from "../services/platform";
import "../platform.css";

interface Admin {
  email: string;
  role: string;
}
interface Config {
  enabled: boolean;
  provider: "sepay";
  bankBin: "970423";
  bankName: "TPBank";
  accountNumber: string;
  accountHolder: string;
  minTopup: number;
  maxTopup: number;
  intentTtl: number;
  version: number;
}
interface Approval {
  id: string;
  kind: string;
  body: string;
  status: string;
  requested_by: string;
  approved_by: string | null;
}
interface Page {
  slug: string;
  title: string;
  description: string;
  blocks: string;
  draft_id: string;
  published_id: string | null;
}
interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  selling_price: number;
  in_stock: boolean | number;
}
interface Customer {
  id: string;
  email: string;
  name: string;
  balance: number;
  disabled: number;
}
type Tab =
  | "overview"
  | "customers"
  | "orders"
  | "finance"
  | "payment"
  | "products"
  | "pages"
  | "telegram"
  | "audit";
type Run = (task: () => Promise<void>) => Promise<void>;
function useAdminCommand() {
  const pending = useRef(new Map<string, string>());
  return async function submit<T>(
    path: string,
    options: { body: unknown },
  ): Promise<T> {
    const signature = JSON.stringify({ path, body: options.body });
    let key = pending.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      pending.current.set(signature, key);
    }
    const result = await api<T>(path, { ...options, key });
    pending.current.delete(signature);
    return result;
  };
}
const labels: [Tab, string][] = [
  ["overview", "Tổng quan"],
  ["customers", "Khách hàng"],
  ["orders", "Đơn & giao hàng"],
  ["finance", "Sổ cái & phê duyệt"],
  ["payment", "Thanh toán TPBank"],
  ["products", "Sản phẩm"],
  ["pages", "Nội dung website"],
  ["telegram", "Telegram & hệ thống"],
  ["audit", "Nhật ký quản trị"],
];

function Orders({ run }: { run: Run }) {
  const [orders, setOrders] = useState<PlatformOrder[]>([]);
  const [selected, setSelected] = useState("");
  const [value, setValue] = useState("");
  async function load() {
    setOrders(
      (await api<{ orders: PlatformOrder[] }>("/api/admin/orders")).orders,
    );
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Đơn hàng & giao sản phẩm</h2>
        <button onClick={() => void run(load)}>Cập nhật</button>
      </div>
      <p className="muted">
        Chỉ giao đơn đã thanh toán. Dữ liệu sản phẩm được mã hóa và khách nhận
        trong tài khoản.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Đơn</th>
              <th>Khách</th>
              <th>Tổng tiền</th>
              <th>Thanh toán</th>
              <th>Giao hàng</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <button className="mono" onClick={() => setSelected(o.id)}>
                    {o.id}
                  </button>
                  <br />
                  {o.channel}
                </td>
                <td>{o.customer.email || o.user_id}</td>
                <td>{amountLabel(o.total, o.currency)}</td>
                <td>{paymentLabel(o.payment_status)}</td>
                <td>{o.fulfillment_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api(`/api/admin/orders/${selected}/deliver`, {
                body: { value },
              });
              setValue("");
              setSelected("");
              await load();
            });
          }}
        >
          <h3>Giao sản phẩm · {selected}</h3>
          <label>
            Key / thông tin tài khoản / hướng dẫn
            <textarea
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={10000}
            />
          </label>
          <button className="primary">Giao sản phẩm cho khách</button>
        </form>
      )}
    </section>
  );
}
function Customers({ run }: { run: Run }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reason, setReason] = useState("");
  async function load() {
    setCustomers(
      (await api<{ customers: Customer[] }>("/api/admin/customers")).customers,
    );
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  return (
    <section className="panel">
      <h2>Khách hàng</h2>
      <label>
        Lý do khóa / mở khóa
        <input
          value={reason}
          minLength={5}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>ID</th>
              <th>Số dư</th>
              <th>Tài khoản</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  <br />
                  {c.email}
                </td>
                <td className="mono">{c.id}</td>
                <td>{amountLabel(c.balance)}</td>
                <td>
                  <button
                    disabled={reason.length < 5}
                    onClick={() =>
                      void run(async () => {
                        await api(`/api/admin/customers/${c.id}/lock`, {
                          body: { disabled: !c.disabled, reason },
                        });
                        await load();
                      })
                    }
                  >
                    {c.disabled ? "Mở khóa" : "Khóa và thu hồi phiên"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function PaymentSettings({ run }: { run: Run }) {
  const submit = useAdminCommand();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [transactions, setTransactions] = useState<{
    transactions: Record<string, unknown>[];
    inbox: Record<string, unknown>[];
    runs: Record<string, unknown>[];
  } | null>(null);
  async function load() {
    const [c, t] = await Promise.all([
      api<Config>("/api/admin/payment-config"),
      api<typeof transactions>("/api/admin/transactions"),
    ]);
    setConfig(c);
    setTransactions(t);
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  return (
    <>
      <section className="panel">
        <h2>Tài khoản nhận tiền TPBank</h2>
        <p className="muted">
          Thay đổi tạo yêu cầu chờ một Owner khác phê duyệt. QR đã phát hành giữ
          nguyên thông tin ban đầu.
        </p>
        {config && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { version, ...body } = config;
                await submit("/api/admin/approvals", {
                  body: {
                    kind: "PAYMENT_CONFIG",
                    config: body,
                    expectedVersion: version,
                  },
                });
              });
            }}
          >
            <label className="check-label">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig({ ...config, enabled: e.target.checked })
                }
              />{" "}
              Bật nhận tiền
            </label>
            <div className="form-grid">
              <label>
                Số tài khoản TPBank
                <input
                  required
                  pattern="[0-9]{6,19}"
                  value={config.accountNumber}
                  onChange={(e) =>
                    setConfig({ ...config, accountNumber: e.target.value })
                  }
                />
              </label>
              <label>
                Chủ tài khoản (IN HOA không dấu)
                <input
                  required
                  value={config.accountHolder}
                  onChange={(e) =>
                    setConfig({ ...config, accountHolder: e.target.value })
                  }
                />
              </label>
              <label>
                Nạp tối thiểu (VND)
                <input
                  type="number"
                  min={10000}
                  value={config.minTopup}
                  onChange={(e) =>
                    setConfig({ ...config, minTopup: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Nạp tối đa (VND)
                <input
                  type="number"
                  value={config.maxTopup}
                  onChange={(e) =>
                    setConfig({ ...config, maxTopup: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Hiệu lực QR (giây)
                <input
                  type="number"
                  min={300}
                  max={3600}
                  value={config.intentTtl}
                  onChange={(e) =>
                    setConfig({ ...config, intentTtl: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <button className="primary">Gửi yêu cầu thay đổi</button>
          </form>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Đối soát giao dịch</h2>
          <button
            onClick={() =>
              void run(async () => {
                await api("/api/admin/reconcile", {
                  body:
                    from && to
                      ? {
                          from: new Date(from).toISOString(),
                          to: new Date(to).toISOString(),
                        }
                      : {},
                });
                await load();
              })
            }
          >
            Chạy đối soát
          </button>
        </div>
        <p className="muted">
          Webhook secret và API key được quản lý trong Cloudflare Secrets.
        </p>
        <div className="form-grid">
          <label>
            Từ ngày/giờ (để trống để tiếp tục tự động)
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Đến ngày/giờ (tối đa 24 giờ mỗi lần)
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        {transactions && (
          <>
            <h3>Khoản cần kiểm tra</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Trạng thái</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.inbox.map((t) => (
                    <tr key={String(t.id)}>
                      <td className="mono">{String(t.id)}</td>
                      <td>{String(t.status)}</td>
                      <td>{String(t.error ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Giao dịch ngân hàng gần nhất</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã giao dịch</th>
                    <th>Số tiền</th>
                    <th>Nội dung</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.transactions.map((t) => (
                    <tr key={String(t.id)}>
                      <td className="mono">{String(t.id)}</td>
                      <td>{amountLabel(Number(t.amount))}</td>
                      <td className="mono">{String(t.content)}</td>
                      <td>{String(t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Lần đối soát gần nhất</h3>
            {transactions.runs.slice(0, 3).map((r) => (
              <p key={String(r.id)}>
                {timeLabel(Number(r.created_at))} · {String(r.status)}
              </p>
            ))}
          </>
        )}
      </section>
    </>
  );
}
function Finance({ admin, run }: { admin: Admin; run: Run }) {
  const submit = useAdminCommand();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [ledger, setLedger] = useState<{
    journals: Record<string, unknown>[];
    differences: unknown[];
  }>({ journals: [], differences: [] });
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState(10000);
  const [reason, setReason] = useState("");
  const [orderId, setOrderId] = useState("");
  async function load() {
    const [a, l] = await Promise.all([
      api<{ approvals: Approval[] }>("/api/admin/approvals"),
      api<typeof ledger>("/api/admin/ledger"),
    ]);
    setApprovals(a.approvals);
    setLedger(l);
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  return (
    <>
      <section className="panel">
        <h2>Yêu cầu điều chỉnh số dư</h2>
        <p className="muted">
          Không sửa số dư trực tiếp. Một người khác phải duyệt; mọi thay đổi
          được ghi vào sổ cái.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await submit("/api/admin/approvals", {
                body: { kind: "WALLET_ADJUSTMENT", userId, delta, reason },
              });
              await load();
            });
          }}
        >
          <div className="form-grid">
            <label>
              ID khách hàng
              <input
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </label>
            <label>
              Thay đổi VND (âm để trừ)
              <input
                required
                type="number"
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
              />
            </label>
          </div>
          <label>
            Lý do
            <input
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button>Gửi yêu cầu điều chỉnh</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await submit("/api/admin/approvals", {
                body: { kind: "WALLET_REFUND", orderId, reason },
              });
              await load();
            });
          }}
        >
          <h3>Hoàn đơn đã trả bằng số dư</h3>
          <label>
            Mã đơn
            <input
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
          </label>
          <p className="muted">
            Dùng lý do ở trên. Hoàn chuyển khoản cần xử lý theo ngân hàng, không
            ghi giả là đã hoàn.
          </p>
          <button disabled={reason.length < 5}>Gửi yêu cầu hoàn số dư</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Phê duyệt</h2>
          <button onClick={() => void run(load)}>Cập nhật</button>
        </div>
        {approvals.map((a) => (
          <article className="panel" key={a.id}>
            <strong>
              {a.kind} · {a.status}
            </strong>
            <p className="muted">Người tạo: {a.requested_by}</p>
            <pre className="code-block">
              {JSON.stringify(JSON.parse(a.body), null, 2)}
            </pre>
            {a.status === "PENDING" && a.requested_by !== admin.email && (
              <button
                className="primary"
                onClick={() =>
                  void run(async () => {
                    await api(`/api/admin/approvals/${a.id}/approve`, {
                      body: {},
                    });
                    await load();
                  })
                }
              >
                Phê duyệt thay đổi
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Sổ cái số dư</h2>
        <p className={ledger.differences.length ? "notice error" : "notice"}>
          {ledger.differences.length
            ? `Có ${ledger.differences.length} số dư cần kiểm tra`
            : "Số dư khớp với sổ cái"}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Khách</th>
                <th>Loại</th>
                <th>Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {ledger.journals.map((j) => (
                <tr key={String(j.id)}>
                  <td>{timeLabel(Number(j.created_at))}</td>
                  <td className="mono">{String(j.user_id)}</td>
                  <td>{String(j.kind)}</td>
                  <td>{amountLabel(Number(j.wallet_delta))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Products({ run }: { run: Run }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product>({
    id: 1,
    name: "",
    description: "",
    category: "Khác",
    image_url: "",
    selling_price: 10000,
    in_stock: false,
  });
  async function load() {
    setProducts(
      (await api<{ products: Product[] }>("/api/admin/products")).products,
    );
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  return (
    <>
      <section className="panel">
        <h2>Danh mục sản phẩm</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Giá VND (website & Telegram)</th>
                <th>Mở bán</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button onClick={() => setProduct(p)}>{p.name}</button>
                  </td>
                  <td>{amountLabel(p.selling_price)}</td>
                  <td>{p.in_stock ? "Có" : "Không"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Thêm / sửa sản phẩm</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/api/admin/products", {
                body: {
                  ...product,
                  in_stock: !!product.in_stock,
                  image_url: product.image_url ?? "",
                },
              });
              await load();
            });
          }}
        >
          <div className="form-grid">
            <label>
              ID
              <input
                required
                type="number"
                min={1}
                value={product.id}
                onChange={(e) =>
                  setProduct({ ...product, id: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Tên sản phẩm
              <input
                required
                value={product.name}
                onChange={(e) =>
                  setProduct({ ...product, name: e.target.value })
                }
              />
            </label>
            <label>
              Giá VND
              <input
                type="number"
                min={1000}
                value={product.selling_price}
                onChange={(e) =>
                  setProduct({
                    ...product,
                    selling_price: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Danh mục
              <input
                value={product.category}
                onChange={(e) =>
                  setProduct({ ...product, category: e.target.value })
                }
              />
            </label>
            <label>
              URL ảnh HTTPS
              <input
                value={product.image_url ?? ""}
                onChange={(e) =>
                  setProduct({ ...product, image_url: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Mô tả
            <textarea
              value={product.description}
              onChange={(e) =>
                setProduct({ ...product, description: e.target.value })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!product.in_stock}
              onChange={(e) =>
                setProduct({ ...product, in_stock: e.target.checked })
              }
            />
            Mở bán (giao hàng thủ công)
          </label>
          <button className="primary">Lưu sản phẩm</button>
        </form>
      </section>
    </>
  );
}
function Pages({ run }: { run: Run }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [slug, setSlug] = useState("trang-chu");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<PageBlock[]>([
    { type: "text", heading: "", text: "" },
  ]);
  const [versions, setVersions] = useState<
    { id: string; title: string; created_at: number }[]
  >([]);
  async function load() {
    setPages((await api<{ pages: Page[] }>("/api/admin/pages")).pages);
  }
  useEffect(() => {
    void run(load);
  }, [run]);
  function edit(page: Page) {
    setSlug(page.slug);
    setTitle(page.title);
    setDescription(page.description);
    setBlocks(JSON.parse(page.blocks));
    void run(async () =>
      setVersions(
        (
          await api<{ versions: typeof versions }>(
            `/api/admin/pages/${page.slug}/versions`,
          )
        ).versions,
      ),
    );
  }
  return (
    <>
      <section className="panel">
        <h2>Nội dung website</h2>
        <div className="stack">
          {pages.map((p) => (
            <div className="balance-strip" key={p.slug}>
              <button onClick={() => edit(p)}>
                {p.title} · /{p.slug}
              </button>
              <div className="action-row">
                <a
                  href={p.slug === "trang-chu" ? "/" : `/pages/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Xem trang ↗
                </a>
                <button
                  onClick={() =>
                    void run(async () => {
                      await api(`/api/admin/pages/${p.slug}/publish`, {
                        body: { versionId: p.draft_id },
                      });
                      await load();
                    })
                  }
                >
                  Xuất bản bản nháp
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Biên tập page</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/api/admin/pages", {
                body: { slug, title, description, blocks },
              });
              await load();
              setVersions(
                (
                  await api<{ versions: typeof versions }>(
                    `/api/admin/pages/${slug}/versions`,
                  )
                ).versions,
              );
            });
          }}
        >
          <div className="form-grid">
            <label>
              Slug
              <input
                required
                pattern="[a-z0-9-]+"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label>
              Tiêu đề
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <label>
            Mô tả trang
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </label>
          {blocks.map((b, i) => (
            <div className="panel" key={i}>
              {b.type === "text" ? (
                <>
                  <label>
                    Tiêu đề khối
                    <input
                      value={b.heading ?? ""}
                      onChange={(e) =>
                        setBlocks(
                          blocks.map((v, n) =>
                            n === i ? { ...v, heading: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Nội dung
                    <textarea
                      value={b.text ?? ""}
                      onChange={(e) =>
                        setBlocks(
                          blocks.map((v, n) =>
                            n === i ? { ...v, text: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                </>
              ) : b.type === "image" ? (
                <>
                  <label>
                    Ảnh
                    <input disabled value={b.url ?? ""} />
                  </label>
                  <label>
                    Mô tả ảnh
                    <input
                      value={b.alt ?? ""}
                      onChange={(e) =>
                        setBlocks(
                          blocks.map((value, index) =>
                            index === i
                              ? { ...value, alt: e.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Nhãn liên kết
                    <input
                      value={b.label ?? ""}
                      onChange={(e) =>
                        setBlocks(
                          blocks.map((value, index) =>
                            index === i
                              ? { ...value, label: e.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    URL HTTPS
                    <input
                      value={b.url ?? ""}
                      onChange={(e) =>
                        setBlocks(
                          blocks.map((value, index) =>
                            index === i
                              ? { ...value, url: e.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                onClick={() => setBlocks(blocks.filter((_, n) => n !== i))}
              >
                Xóa khối
              </button>
            </div>
          ))}
          <div className="action-row">
            <button
              type="button"
              onClick={() =>
                setBlocks([...blocks, { type: "text", heading: "", text: "" }])
              }
            >
              Thêm khối nội dung
            </button>
            <button className="primary">Lưu bản nháp</button>
          </div>
        </form>
        <label>
          Thêm ảnh vào page (PNG, JPEG, WebP; tối đa 2 MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void run(async () => {
                if (file.size > 2 * 1024 * 1024)
                  throw new Error("Ảnh vượt quá 2 MB");
                const response = await fetch("/api/admin/media", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": file.type },
                  body: file,
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setBlocks((current) => [
                  ...current,
                  { type: "image", url: result.url, alt: "" },
                ]);
              });
              e.target.value = "";
            }}
          />
        </label>
        <div className="preview">
          <h3>Xem trước</h3>
          <h2>{title}</h2>
          <p>{description}</p>
          {blocks.map((b, i) => (
            <div key={i}>
              {b.type === "image" ? (
                <img src={b.url} alt={b.alt ?? ""} />
              ) : b.type === "link" ? (
                <p>
                  {b.label} · {b.url}
                </p>
              ) : (
                <>
                  <h3>{b.heading}</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{b.text}</p>
                </>
              )}
            </div>
          ))}
        </div>
        {versions.length > 0 && (
          <>
            <h3>Lịch sử & khôi phục</h3>
            {versions.map((v) => (
              <p key={v.id}>
                {v.title} · {timeLabel(v.created_at)}{" "}
                <button
                  onClick={() =>
                    void run(async () => {
                      await api(`/api/admin/pages/${slug}/publish`, {
                        body: { versionId: v.id },
                      });
                      await load();
                    })
                  }
                >
                  Xuất bản phiên bản này
                </button>
              </p>
            ))}
          </>
        )}
      </section>
    </>
  );
}
function ReadonlyPanel({ path, run }: { path: string; run: Run }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void run(async () => setData(await api(`/api/admin/${path}`)));
  }, [path, run]);
  return (
    <section className="panel">
      <h2>{path === "audit" ? "Nhật ký quản trị" : "Trạng thái kết nối"}</h2>
      {path === "status" && (
        <button
          onClick={() =>
            void run(async () => {
              await api("/api/admin/maintenance", { body: {} });
              setData(await api("/api/admin/status"));
            })
          }
        >
          Khôi phục inbox và gửi thông báo tồn đọng
        </button>
      )}
      {data &&
        Object.entries(data).map(([key, value]) => (
          <div key={key} className="receipt-lines">
            <h3>{key}</h3>
            <pre className="code-block">
              {typeof value === "object"
                ? JSON.stringify(value, null, 2)
                : String(value)}
            </pre>
          </div>
        ))}
      {path === "status" &&
        Array.isArray(data?.outbox) &&
        data.outbox.map((event: { id: string; attempts: number }) => (
          <p key={event.id}>
            <span className="mono">{event.id}</span> · {event.attempts} lần thử{" "}
            <button
              onClick={() =>
                void run(async () => {
                  await api(
                    `/api/admin/outbox/${encodeURIComponent(event.id)}/retry`,
                    { body: {} },
                  );
                  setData(await api("/api/admin/status"));
                })
              }
            >
              Gửi lại thông báo
            </button>
          </p>
        ))}
    </section>
  );
}
function Overview({ run }: { run: Run }) {
  const [data, setData] = useState<{
    payments: {
      currency: string;
      channel: string;
      total: number;
      count: number;
    }[];
    wallets: { liability: number };
    review: { count: number };
    backlog: { count: number };
  } | null>(null);
  useEffect(() => {
    void run(async () => setData(await api("/api/admin/overview")));
  }, [run]);
  return (
    <>
      {data && (
        <div className="metric-grid">
          <div className="metric">
            <span>Tổng số dư khách hàng</span>
            <strong>{amountLabel(data.wallets.liability)}</strong>
          </div>
          <div className="metric">
            <span>Cần đối soát</span>
            <strong>{data.review.count}</strong>
          </div>
          <div className="metric">
            <span>Thông báo đang chờ</span>
            <strong>{data.backlog.count}</strong>
          </div>
          {data.payments.map((p) => (
            <div className="metric" key={`${p.currency}:${p.channel}`}>
              <span>
                {p.count} đơn đã thanh toán ·{" "}
                {p.channel === "telegram" ? "Telegram" : "Website"}
              </span>
              <strong>{amountLabel(p.total, p.currency)}</strong>
            </div>
          ))}
        </div>
      )}
      <section className="panel">
        <h2>Vận hành cửa hàng</h2>
        <p>
          Kiểm tra giao dịch cần đối soát trước khi xử lý điều chỉnh tiền. Cấu
          hình ngân hàng và thay đổi số dư cần hai người phê duyệt.
        </p>
        <p className="muted">
          Website và Telegram dùng chung tài khoản, giá VND và số dư. Cả hai
          kênh nhận thanh toán bằng số dư hoặc QR TPBank.
        </p>
      </section>
    </>
  );
}
export function AdminPage() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage("Đã cập nhật dữ liệu.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    api<Admin>("/api/admin/me")
      .then(setAdmin)
      .catch((error) => setError(error.message));
  }, []);
  return (
    <div className="platform platform-shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          tiệm<span>digital.</span> <small>admin</small>
        </a>
        <div className="action-row">
          <span>
            {admin?.email} · {admin?.role}
          </span>
          <a href="/cdn-cgi/access/logout">Đăng xuất Access</a>
        </div>
      </header>
      {!admin ? (
        <section className="auth-card">
          <h1>Quản trị cửa hàng</h1>
          <p>Đăng nhập qua Cloudflare Access và tài khoản được cấp quyền.</p>
          {error && <p className="notice error">{error}</p>}
        </section>
      ) : (
        <div className="workspace">
          <nav className="navigation" aria-label="Quản trị">
            {labels.map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(id);
                  setError("");
                  setMessage("");
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <main className="content">
            <span className="eyebrow">Tiệm Digital · Khu vực quản trị</span>
            <h1>{labels.find(([id]) => id === tab)?.[1]}</h1>
            {busy && (
              <p role="status" className="muted">
                Đang xử lý…
              </p>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            {message && !busy && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            {tab === "overview" && <Overview run={run} />}{" "}
            {tab === "customers" && <Customers run={run} />}{" "}
            {tab === "orders" && <Orders run={run} />}{" "}
            {tab === "finance" && <Finance admin={admin} run={run} />}{" "}
            {tab === "payment" && <PaymentSettings run={run} />}{" "}
            {tab === "products" && <Products run={run} />}{" "}
            {tab === "pages" && <Pages run={run} />}{" "}
            {tab === "telegram" && <ReadonlyPanel path="status" run={run} />}{" "}
            {tab === "audit" && <ReadonlyPanel path="audit" run={run} />}
          </main>
        </div>
      )}
    </div>
  );
}
