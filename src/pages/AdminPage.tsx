import { DropdownChipFilter } from "../components/admin/DropdownChipFilter";
import { SmartTable } from "../components/admin/SmartTable";
import { TableSearchContext } from "../components/admin/TableSearchContext";
import { VendorCatalog } from "../components/admin/VendorCatalog";
import { TelegramSettings } from "../components/admin/TelegramSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Truck,
  BarChart3,
  Landmark,
  Package,
  Bot,
  ShieldAlert,
  Plug,
  Sun,
  Moon,
} from "lucide-react";
import {
  api,
  amountLabel,
  timeLabel,
  paymentLabel,
  fulfillmentLabel,
  type PlatformOrder,
} from "../services/platform";
import "../platform.css";
import { AuthForm } from "../components/AuthForm";
import {
  CatalogProducts,
  ReadOnlyProducts,
  Providers,
  PurchaseOrders,
  FulfillmentAlerts,
  BusinessFinance,
} from "../components/admin/CommerceAdmin";

interface Admin {
  userId?: string;
  username?: string;
  email: string;
  role: string;
}

interface Config {
  enabled: boolean;
  provider: "sepay";
  bankBin: "970416";
  bankName: "ACB";
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

interface Customer {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  phone?: string;
  order_count?: number;
  balance: number;
  disabled: number;
}

interface CustomerDetailResponse {
  customer: Customer;
  orders: PlatformOrder[];
  journals: Record<string, unknown>[];
  telegram: { telegram_id: string; chat_id: string } | null;
}

type Tab =
  | "overview"
  | "customers"
  | "orders"
  | "purchases"
  | "finance"
  | "finance-report"
  | "finance-transactions"
  | "payment"
  | "products"
  | "vendor-catalog"
  | "telegram"
  | "audit"
  | "providers";

type Run = (task: () => Promise<void>) => Promise<void>;

/**
 * Cuộn mượt tới khu vực chi tiết/biên tập và tự động focus ô nhập liệu đầu tiên.
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
 * Tạo và quản lý Idempotency-Key cho các thao tác ghi dữ liệu nhạy cảm của quản trị viên.
 */
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
  ["purchases", "Mua hàng NCC"],
  ["finance", "Ví & sổ cái"],
  ["finance-report", "Báo cáo doanh thu"],
  ["finance-transactions", "Sổ giao dịch MMO"],
  ["payment", "Thanh toán ngân hàng"],
  ["products", "Sản phẩm"],
  ["vendor-catalog", "Sản phẩm NCC"],
  ["telegram", "Telegram Bot"],
  ["audit", "Nhật ký quản trị"],
  ["providers", "Nhà cung cấp"],
];

const navGroups: { title: string; items: Tab[] }[] = [
  {
    title: "Vận hành & Bán hàng",
    items: ["overview", "orders", "customers"],
  },
  {
    title: "Danh mục & Nguồn hàng",
    items: ["products", "vendor-catalog", "providers"],
  },
  {
    title: "Tài chính & Ngân hàng",
    items: ["finance-report", "finance-transactions", "finance", "payment"],
  },
  {
    title: "Nội dung & Hệ thống",
    items: ["telegram", "audit"],
  },
];

/**
 * Hiển thị biểu tượng trực quan tương ứng với từng phân hệ quản trị trên thanh điều hướng.
 */
function TabIcon({ tab }: { tab: Tab }) {
  const props = { size: 16, "aria-hidden": true as const };
  switch (tab) {
    case "overview":
      return <LayoutDashboard {...props} />;
    case "customers":
      return <Users {...props} />;
    case "orders":
      return <ShoppingBag {...props} />;
    case "purchases":
      return <Truck {...props} />;
    case "finance":
    case "finance-report":
    case "finance-transactions":
      return <BarChart3 {...props} />;
    case "payment":
      return <Landmark {...props} />;
    case "products":
    case "vendor-catalog":
      return <Package {...props} />;
    case "telegram":
      return <Bot {...props} />;
    case "audit":
      return <ShieldAlert {...props} />;
    case "providers":
      return <Plug {...props} />;
  }
}

/**
 * Xác định kiểu màu nhãn trạng thái cho đơn hàng và thanh toán.
 */
function statusClass(status: string) {
  if (["PAID", "DELIVERED", "SUCCEEDED", "completed"].includes(status)) {
    return "status good";
  }
  if (["REVIEW", "FAILED", "failed", "cancelled"].includes(status)) {
    return "status danger-badge";
  }
  return "status";
}

/**
 * Quản lý danh sách đơn hàng của khách, tra cứu chi tiết, xem dữ liệu đã giao và giao hàng thủ công.
 */
function Orders({ run }: { run: Run }) {
  const [orders, setOrders] = useState<PlatformOrder[]>([]);
  const [selected, setSelected] = useState("");
  const [value, setValue] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deliveredView, setDeliveredView] = useState<{
    orderId: string;
    items: string[];
    value: string | null;
  } | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  async function load(q = search, status = statusFilter) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    const qs = params.toString() ? `?${params.toString()}` : "";
    setOrders(
      (await api<{ orders: PlatformOrder[] }>(`/api/admin/orders${qs}`)).orders,
    );
  }

  useEffect(() => {
    void run(() => load("", ""));
  }, [run]);

  const selectedOrder = orders.find((o) => o.id === selected);
  const paidCount = orders.filter((o) => o.payment_status === "PAID").length;
  const deliveredCount = orders.filter(
    (o) => o.fulfillment_status === "DELIVERED",
  ).length;
  const reviewCount = orders.filter(
    (o) => o.fulfillment_status === "REVIEW",
  ).length;

  return (
    <div className="admin-split-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Đơn hàng & giao sản phẩm</h2>
            <p className="muted">
              Chỉ giao đơn đã thanh toán. Dữ liệu sản phẩm được mã hóa và khách
              nhận trong tài khoản.
            </p>
          </div>
          <button onClick={() => void run(() => load(search, statusFilter))}>
            Cập nhật
          </button>
        </div>
        <div className="admin-kv-grid">
          <div className="admin-kv-item">
            <small>Tổng đơn hiển thị</small>
            <strong>{orders.length}</strong>
          </div>
          <div className="admin-kv-item">
            <small>Đã thanh toán</small>
            <strong>{paidCount}</strong>
          </div>
          <div className="admin-kv-item">
            <small>Đã giao hoàn tất</small>
            <strong>{deliveredCount}</strong>
          </div>
          <div className="admin-kv-item">
            <small>Cần kiểm tra</small>
            <strong>{reviewCount}</strong>
          </div>
        </div>
        <form
          className="admin-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load(search, statusFilter));
          }}
        >
          <input
            aria-label="Tìm đơn khách hàng"
            placeholder="Tìm theo mã đơn, email, tên sản phẩm…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DropdownChipFilter
            label="Lọc trạng thái đơn"
            value={statusFilter}
            allLabel="Tất cả trạng thái"
            options={[
              { value: "PAID", label: "Đã thanh toán" },
              { value: "UNPAID", label: "Chưa thanh toán" },
              { value: "DELIVERED", label: "Đã giao" },
              { value: "QUEUED", label: "Chờ giao" },
              { value: "AWAITING", label: "Đã mua NCC · chờ giao" },
              { value: "REVIEW", label: "Cần kiểm tra" },
            ]}
            onChange={(next) => {
              setStatusFilter(next);
              void run(() => load(search, next));
            }}
          />
          <button className="primary">Tìm đơn</button>
        </form>
        <div className="table-wrap">
          <SmartTable>
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
                <tr
                  key={o.id}
                  className={`clickable-row ${selected === o.id ? "selected-row" : ""}`}
                  onClick={() => {
                    setSelected(o.id);
                    setDeliveredView(null);
                    focusPanel(detailRef.current);
                  }}
                >
                  <td>
                    <strong className="mono">{o.id}</strong>
                    <br />
                    <small className="muted">
                      {o.channel === "telegram" ? "Telegram" : "Website"} ·{" "}
                      {timeLabel(o.created_at)}
                    </small>
                  </td>
                  <td>
                    <strong>{o.customer.fullName || "Khách hàng"}</strong>
                    <br />
                    <small className="muted">
                      {o.customer.email || o.user_id}
                    </small>
                  </td>
                  <td>
                    <strong>{amountLabel(o.total, o.currency)}</strong>
                  </td>
                  <td>
                    <span className={statusClass(o.payment_status)}>
                      {paymentLabel(o.payment_status)}
                    </span>
                  </td>
                  <td>
                    <span className={statusClass(o.fulfillment_status)}>
                      {fulfillmentLabel(o.fulfillment_status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </SmartTable>
        </div>
        {!orders.length && (
          <div className="empty-state">
            <p>Không tìm thấy đơn hàng nào khớp với điều kiện lọc.</p>
          </div>
        )}
      </section>

      <aside
        className={`admin-sticky-pane admin-detail-pane ${selectedOrder ? "is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected("");
        }}
      >
        {selectedOrder ? (
          <section className="panel panel-focus-target" ref={detailRef}>
            <div className="panel-heading">
              <h3>
                Chi tiết đơn {selectedOrder.id} ·{" "}
                {paymentLabel(selectedOrder.payment_status)} ·{" "}
                {fulfillmentLabel(selectedOrder.fulfillment_status)}
              </h3>
              <button type="button" onClick={() => setSelected("")}>
                Đóng
              </button>
            </div>
            <div className="admin-kv-grid">
              <div className="admin-kv-item">
                <small>Khách hàng</small>
                <strong>{selectedOrder.customer.fullName || "—"}</strong>
              </div>
              <div className="admin-kv-item">
                <small>Email / ID</small>
                <strong>
                  {selectedOrder.customer.email || selectedOrder.user_id}
                </strong>
              </div>
              <div className="admin-kv-item">
                <small>Số điện thoại</small>
                <strong>{selectedOrder.customer.phone || "—"}</strong>
              </div>
              <div className="admin-kv-item">
                <small>Thời gian tạo</small>
                <strong>{timeLabel(selectedOrder.created_at)}</strong>
              </div>
            </div>
            {selectedOrder.customer.note && (
              <p className="muted">
                Ghi chú của khách: {selectedOrder.customer.note}
              </p>
            )}
            <div className="admin-detail">
              <strong>Sản phẩm đặt mua:</strong>
              {selectedOrder.items.map((item) => (
                <p key={item.productId}>
                  {item.name} × {item.quantity} ·{" "}
                  {amountLabel(
                    item.price * item.quantity,
                    selectedOrder.currency,
                  )}
                </p>
              ))}
            </div>
            {!!selectedOrder.fulfillments?.length && (
              <div className="admin-detail">
                <strong>Tiến độ giao hàng tự động:</strong>
                {selectedOrder.fulfillments.map((f) => (
                  <p key={f.product_id}>
                    {f.name}: {f.delivered_quantity}/{f.quantity} đã giao ·{" "}
                    {fulfillmentLabel(f.status)}
                  </p>
                ))}
              </div>
            )}
            {deliveredView?.orderId === selectedOrder.id && (
              <pre className="code-block">
                {deliveredView.value ||
                  deliveredView.items.join("\n") ||
                  "Chưa có dữ liệu đã giao"}
              </pre>
            )}
            <div className="action-row">
              {(selectedOrder.fulfillment_status === "DELIVERED" ||
                selectedOrder.fulfillments?.some(
                  (f) => f.delivered_quantity > 0,
                )) && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const res = await api<{
                        items: string[];
                        value: string | null;
                      }>(`/api/admin/orders/${selectedOrder.id}/delivery`);
                      setDeliveredView({
                        orderId: selectedOrder.id,
                        items: res.items,
                        value: res.value,
                      });
                    })
                  }
                >
                  Xem dữ liệu đã giao
                </button>
              )}
              {selectedOrder.payment_status === "UNPAID" && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await api(`/api/admin/orders/${selectedOrder.id}`, {
                        method: "DELETE",
                      });
                      setSelected("");
                      await load(search, statusFilter);
                    })
                  }
                >
                  Xóa đơn chưa thanh toán
                </button>
              )}
            </div>
            {selectedOrder.payment_status === "UNPAID" && (
              <p className="muted">
                Đơn chưa thanh toán nên chưa thể giao sản phẩm.
              </p>
            )}
            {selectedOrder.payment_status === "PAID" &&
              selectedOrder.fulfillment_status !== "DELIVERED" &&
              !selectedOrder.fulfillments?.length && (
                <form
                  className="admin-detail"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api(`/api/admin/orders/${selected}/deliver`, {
                        body: { value },
                      });
                      setValue("");
                      setSelected("");
                      await load(search, statusFilter);
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
        ) : (
          <section className="panel">
            <h3>Chi tiết & giao hàng</h3>
            <div className="empty-state">
              <p>
                Chọn mã đơn hàng ở bảng bên trái để xem thông tin khách, kiểm
                tra dữ liệu đã giao hoặc giao hàng thủ công.
              </p>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

/**
 * Quản lý khách hàng, tìm kiếm, xem hồ sơ chi tiết, chỉnh sửa thông tin và khóa/mở khóa phiên.
 */
function Customers({
  run,
  onAdjustWallet,
}: {
  run: Run;
  onAdjustWallet?: (customerId: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reason, setReason] = useState("Kiểm tra bảo mật tài khoản");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const detailRef = useRef<HTMLDivElement | null>(null);

  async function load(q = search) {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    setCustomers(
      (await api<{ customers: Customer[] }>(`/api/admin/customers${qs}`))
        .customers,
    );
  }

  useEffect(() => {
    void run(() => load(""));
  }, [run]);

  const totalBalance = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
  const lockedCount = customers.filter((c) => c.disabled).length;

  return (
    <div className="admin-split-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Khách hàng</h2>
            <p className="muted">
              Quản lý tài khoản, tra cứu lịch sử mua hàng và điều phối bảo mật
              phiên đăng nhập.
            </p>
          </div>
          <button onClick={() => void run(() => load(search))}>Cập nhật</button>
        </div>
        <div className="admin-kv-grid">
          <div className="admin-kv-item">
            <small>Tổng khách hàng</small>
            <strong>{customers.length}</strong>
          </div>
          <div className="admin-kv-item">
            <small>Tổng số dư hiển thị</small>
            <strong>{amountLabel(totalBalance)}</strong>
          </div>
          <div className="admin-kv-item">
            <small>Đang hoạt động</small>
            <strong>{customers.length - lockedCount}</strong>
          </div>
          <div className="admin-kv-item">
            <small>Đang khóa</small>
            <strong>{lockedCount}</strong>
          </div>
        </div>
        <form
          className="admin-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => load(search));
          }}
        >
          <input
            aria-label="Tìm khách hàng"
            placeholder="Tìm theo tên, email, SĐT hoặc ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="primary">Tìm khách</button>
        </form>
        <div className="table-wrap">
          <SmartTable>
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>ID</th>
                <th>Số dư</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className={`clickable-row ${detail?.customer.id === c.id ? "selected-row" : ""}`}
                  onClick={() =>
                    void run(async () => {
                      const info = await api<CustomerDetailResponse>(
                        `/api/admin/customers/${encodeURIComponent(c.id)}`,
                      );
                      setDetail(info);
                      setEditName(info.customer.name);
                      setEditPhone(info.customer.phone ?? "");
                      focusPanel(detailRef.current);
                    })
                  }
                >
                  <td>
                    <strong>{c.name}</strong>
                    <br />
                    <small className="muted">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </small>
                  </td>
                  <td className="mono">{c.id}</td>
                  <td>
                    <strong>{amountLabel(c.balance)}</strong>
                  </td>
                  <td>
                    <span
                      className={
                        c.disabled ? "status danger-badge" : "status good"
                      }
                    >
                      {c.disabled ? "Đang khóa" : "Hoạt động"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </SmartTable>
        </div>
      </section>

      <aside
        className={`admin-sticky-pane admin-detail-pane ${detail ? "is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDetail(null);
        }}
      >
        {detail ? (
          <section className="panel panel-focus-target" ref={detailRef}>
            <div className="panel-heading">
              <h3>
                Hồ sơ khách hàng · {detail.customer.name} ({detail.customer.id})
              </h3>
              <button type="button" onClick={() => setDetail(null)}>
                Đóng
              </button>
            </div>
            <div className="admin-kv-grid">
              <div className="admin-kv-item">
                <small>Email</small>
                <strong>{detail.customer.email}</strong>
              </div>
              <div className="admin-kv-item">
                <small>Số dư ví</small>
                <strong>{amountLabel(detail.customer.balance)}</strong>
              </div>
              <div className="admin-kv-item">
                <small>Trạng thái</small>
                <strong>
                  {detail.customer.disabled ? "Đã khóa" : "Đang hoạt động"}
                </strong>
              </div>
              <div className="admin-kv-item">
                <small>Telegram</small>
                <strong>
                  {detail.telegram
                    ? detail.telegram.telegram_id
                    : "Chưa liên kết"}
                </strong>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api(
                    `/api/admin/customers/${encodeURIComponent(detail.customer.id)}`,
                    {
                      method: "PUT",
                      body: { name: editName, phone: editPhone },
                    },
                  );
                  await load(search);
                  const refreshed = await api<CustomerDetailResponse>(
                    `/api/admin/customers/${encodeURIComponent(detail.customer.id)}`,
                  );
                  setDetail(refreshed);
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Tên khách hàng
                  <input
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <label>
                  Số điện thoại
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </label>
              </div>
              <div className="action-row">
                <button className="primary">Lưu thông tin khách</button>
                {onAdjustWallet && (
                  <button
                    type="button"
                    onClick={() => onAdjustWallet(detail.customer.id)}
                  >
                    Điều chỉnh số dư ví
                  </button>
                )}
              </div>
            </form>
            <div className="admin-detail">
              <label>
                Lý do khóa / mở khóa tài khoản
                <input
                  value={reason}
                  minLength={5}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="action-row">
                <button
                  type="button"
                  disabled={reason.length < 5}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `/api/admin/customers/${detail.customer.id}/lock`,
                        {
                          body: {
                            disabled: !detail.customer.disabled,
                            reason,
                          },
                        },
                      );
                      await load(search);
                      const updated = await api<CustomerDetailResponse>(
                        `/api/admin/customers/${encodeURIComponent(detail.customer.id)}`,
                      );
                      setDetail(updated);
                    })
                  }
                >
                  {detail.customer.disabled
                    ? "Mở khóa tài khoản"
                    : "Khóa và thu hồi phiên"}
                </button>
              </div>
            </div>
            {detail.orders.length > 0 && (
              <div className="admin-detail">
                <strong>Đơn hàng gần đây ({detail.orders.length}):</strong>
                {detail.orders.slice(0, 5).map((o) => (
                  <p key={o.id}>
                    <span className="mono">{o.id}</span> ·{" "}
                    {amountLabel(o.total, o.currency)} ·{" "}
                    {paymentLabel(o.payment_status)} ·{" "}
                    {fulfillmentLabel(o.fulfillment_status)}
                  </p>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="panel">
            <h3>Hồ sơ chi tiết khách hàng</h3>
            <div className="empty-state">
              <p>
                Nhấn vào tên khách hàng ở bảng bên trái để chỉnh sửa hồ sơ, xem
                liên kết Telegram và lịch sử đơn hàng.
              </p>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

/**
 * Cấu hình tài khoản ngân hàng nhận tiền và đối soát giao dịch SePay.
 */
function PaymentSettings({ admin, run }: { admin: Admin; run: Run }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [transactions, setTransactions] = useState<{
    transactions: Record<string, unknown>[];
    inbox: Record<string, unknown>[];
    runs: Record<string, unknown>[];
  } | null>(null);

  async function load() {
    const [c, t, a] = await Promise.all([
      api<Config>("/api/admin/payment-config"),
      api<typeof transactions>("/api/admin/transactions"),
      api<{ approvals: Approval[] }>("/api/admin/approvals"),
    ]);
    setConfig(c);
    setTransactions(t);
    setApprovals(
      a.approvals.filter(
        (item) => item.kind === "PAYMENT_CONFIG" && item.status === "PENDING",
      ),
    );
  }

  useEffect(() => {
    void run(load);
  }, [run]);

  return (
    <div className="admin-two-col">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Tài khoản nhận tiền</h2>
            <p className="muted">
              Cấu hình tài khoản ACB nhận tiền tự động qua SePay. Thay đổi của
              Owner được áp dụng ngay lập tức. QR đã phát hành giữ nguyên thông
              tin ban đầu.
            </p>
          </div>
          {config && (
            <span className={config.enabled ? "status good" : "status"}>
              {config.enabled ? "Đang bật nhận tiền" : "Đang tạm tắt"}
            </span>
          )}
        </div>
        {config && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { version, ...body } = config;
                await api("/api/admin/payment-config", {
                  method: "PUT",
                  body: {
                    config: { ...body, bankName: "ACB", bankBin: "970416" },
                    expectedVersion: version,
                  },
                });
                await load();
              });
            }}
          >
            <div className="admin-kv-grid">
              <div className="admin-kv-item">
                <small>Ngân hàng thụ hưởng</small>
                <strong>ACB (BIN 970416)</strong>
              </div>
              <div className="admin-kv-item">
                <small>Cổng webhook</small>
                <strong>SePay Auto</strong>
              </div>
              <div className="admin-kv-item">
                <small>Phiên bản cấu hình</small>
                <strong>v{config.version}</strong>
              </div>
            </div>
            <div className="action-row" style={{ marginBottom: 14 }}>
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
            </div>
            <div className="form-grid">
              <label>
                Số tài khoản
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
            <button className="primary">Lưu cấu hình nhận tiền</button>
          </form>
        )}
        {approvals.length > 0 && (
          <div className="admin-detail">
            <h3>
              Yêu cầu thay đổi cấu hình cũ đang chờ ({approvals.length})
            </h3>
            {approvals.map((a) => (
              <div key={a.id} style={{ marginTop: 10 }}>
                <p className="muted">
                  Người tạo: {a.requested_by} · Bấm Lưu cấu hình ở trên để áp
                  dụng trực tiếp hoặc hủy yêu cầu cũ này.
                </p>
                <div className="action-row">
                  {a.requested_by !== admin.email && (
                    <button
                      type="button"
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
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await api(`/api/admin/approvals/${a.id}`, {
                          method: "DELETE",
                        });
                        await load();
                      })
                    }
                  >
                    Hủy yêu cầu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Đối soát giao dịch</h2>
            <p className="muted">
              Webhook secret và API key được quản lý trong Cloudflare Secrets.
            </p>
          </div>
          <button
            className="primary"
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
          <div className="stack">
            <div>
              <h3>Khoản cần kiểm tra ({transactions.inbox.length})</h3>
              <div className="table-wrap">
                <SmartTable>
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Trạng thái</th>
                      <th>Lý do</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.inbox.map((t) => (
                      <tr key={String(t.id)}>
                        <td className="mono">{String(t.id)}</td>
                        <td>
                          <span className="status">{String(t.status)}</span>
                        </td>
                        <td>{String(t.error ?? "")}</td>
                        <td>
                          <div className="action-row">
                            <button
                              type="button"
                              onClick={() =>
                                void run(async () => {
                                  await api(
                                    `/api/admin/inbox/${encodeURIComponent(String(t.id))}/retry`,
                                    { body: {} },
                                  );
                                  await load();
                                })
                              }
                            >
                              Thử lại
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void run(async () => {
                                  await api(
                                    `/api/admin/inbox/${encodeURIComponent(String(t.id))}`,
                                    { method: "DELETE" },
                                  );
                                  await load();
                                })
                              }
                            >
                              Bỏ qua
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </SmartTable>
              </div>
            </div>
            <div>
              <h3>Giao dịch ngân hàng gần nhất</h3>
              <div className="table-wrap">
                <SmartTable>
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
                        <td>
                          <strong>{amountLabel(Number(t.amount))}</strong>
                        </td>
                        <td className="mono">{String(t.content)}</td>
                        <td>
                          <span className={statusClass(String(t.status))}>
                            {String(t.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </SmartTable>
              </div>
            </div>
            <div>
              <h3>Lần đối soát gần nhất</h3>
              {transactions.runs.slice(0, 3).map((r) => (
                <p key={String(r.id)}>
                  {timeLabel(Number(r.created_at))} · {String(r.status)}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Quản lý điều chỉnh/hoàn số dư khách hàng và đối chiếu sổ cái.
 */
function Finance({
  admin,
  run,
  initialUserId = "",
}: {
  admin: Admin;
  run: Run;
  initialUserId?: string;
}) {
  const submit = useAdminCommand();
  const isOwner = admin.role === "owner";
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [ledger, setLedger] = useState<{
    journals: Record<string, unknown>[];
    differences: unknown[];
  }>({ journals: [], differences: [] });
  const [userId, setUserId] = useState(initialUserId);
  const [delta, setDelta] = useState(10000);
  const [reason, setReason] = useState("");
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    if (initialUserId) setUserId(initialUserId);
  }, [initialUserId]);

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
    <div className="admin-two-col">
      <div>
        <section className="panel">
          <h2>
            {isOwner
              ? "Điều chỉnh & hoàn số dư ví"
              : "Yêu cầu điều chỉnh số dư"}
          </h2>
          <p className="muted">
            {isOwner
              ? "Thay đổi của Owner được áp dụng trực tiếp và ghi nhận ngay vào sổ cái."
              : "Không sửa số dư trực tiếp. Một người khác phải duyệt; mọi thay đổi được ghi vào sổ cái."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (isOwner) {
                  await api("/api/admin/wallet-adjustments", {
                    body: { userId, delta, reason },
                  });
                  setReason("");
                } else {
                  await submit("/api/admin/approvals", {
                    body: { kind: "WALLET_ADJUSTMENT", userId, delta, reason },
                  });
                }
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
            <button className="primary">
              {isOwner ? "Thực hiện điều chỉnh số dư" : "Gửi yêu cầu điều chỉnh"}
            </button>
          </form>
          <form
            className="admin-detail"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (isOwner) {
                  await api("/api/admin/wallet-refunds", {
                    body: { orderId, reason },
                  });
                  setOrderId("");
                  setReason("");
                } else {
                  await submit("/api/admin/approvals", {
                    body: { kind: "WALLET_REFUND", orderId, reason },
                  });
                }
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
              Dùng lý do ở trên. Hoàn chuyển khoản cần xử lý theo ngân hàng,
              không ghi giả là đã hoàn.
            </p>
            <button disabled={reason.length < 5}>
              {isOwner ? "Thực hiện hoàn số dư" : "Gửi yêu cầu hoàn số dư"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Phê duyệt ({approvals.length})</h2>
            <button onClick={() => void run(load)}>Cập nhật</button>
          </div>
          {!approvals.length ? (
            <p className="muted">Chưa có yêu cầu phê duyệt nào.</p>
          ) : (
            approvals.map((a) => (
              <article className="admin-detail" key={a.id}>
                <div className="panel-heading">
                  <strong>
                    {a.kind} · {a.status}
                  </strong>
                  <span
                    className={
                      a.status === "APPROVED" ? "status good" : "status"
                    }
                  >
                    {a.status}
                  </span>
                </div>
                <p className="muted">
                  Người tạo: {a.requested_by}
                  {a.status === "PENDING" && a.requested_by === admin.email
                    ? " · Cần người quản trị thứ hai phê duyệt"
                    : ""}
                </p>
                <pre className="code-block">
                  {JSON.stringify(JSON.parse(a.body), null, 2)}
                </pre>
                {a.status === "PENDING" && (
                  <div className="action-row">
                    {a.requested_by !== admin.email && (
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
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await api(`/api/admin/approvals/${a.id}`, {
                            method: "DELETE",
                          });
                          await load();
                        })
                      }
                    >
                      Hủy yêu cầu
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Sổ cái số dư</h2>
        <p className={ledger.differences.length ? "notice error" : "notice"}>
          {ledger.differences.length
            ? `Có ${ledger.differences.length} số dư cần kiểm tra`
            : "Số dư khớp với sổ cái"}
        </p>
        <div className="table-wrap">
          <SmartTable>
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
                  <td>
                    <span className="status neutral">{String(j.kind)}</span>
                  </td>
                  <td>
                    <strong
                      className={
                        Number(j.wallet_delta) >= 0 ? "positive" : "danger"
                      }
                    >
                      {Number(j.wallet_delta) > 0 ? "+" : ""}
                      {amountLabel(Number(j.wallet_delta))}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </SmartTable>
        </div>
      </section>
    </div>
  );
}

/** Nhật ký thao tác quản trị. */
function AuditPanel({ run }: { run: Run }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { void run(async () => setRows((await api<{ events: Record<string, unknown>[] }>("/api/admin/audit")).events)); }, [run]);
  return <section className="panel">
    <div className="panel-heading"><h2>Nhật ký quản trị</h2><button onClick={() => void run(async () => setRows((await api<{ events: Record<string, unknown>[] }>("/api/admin/audit")).events))}>Tải lại</button></div>
    <div className="table-wrap"><SmartTable><thead><tr><th>Thời gian</th><th>Tác nhân</th><th>Hành động</th><th>Đối tượng</th></tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}><td>{row.created_at ? timeLabel(Number(row.created_at)) : "—"}</td><td className="mono">{String(row.actor ?? "—")}</td><td>{String(row.action ?? "—")}</td><td className="mono">{String(row.target ?? "—")}</td></tr>)}</tbody></SmartTable></div>
  </section>;
}

/**
 * Hiển thị bảng điều khiển tổng quan, chỉ số vận hành và lối tắt thao tác nhanh.
 */
function Overview({ run, query }: { run: Run; query: string }) {
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
  const match = (value: string) => value.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"));
  return (
    <>
      {data && (
        <div className="metric-grid">
          {match("Tổng số dư khách hàng") && <div className="metric">
            <span>Tổng số dư khách hàng</span>
            <strong>{amountLabel(data.wallets.liability)}</strong>
          </div>}
          {match("Cần đối soát") && <div className="metric">
            <span>Cần đối soát</span>
            <strong>{data.review.count}</strong>
          </div>}
          {match("Thông báo đang chờ") && <div className="metric">
            <span>Thông báo đang chờ</span>
            <strong>{data.backlog.count}</strong>
          </div>}
          {data.payments.filter((p) => match(`${p.channel === "telegram" ? "Telegram" : "Website"} ${p.currency} đơn đã thanh toán`)).map((p) => (
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
      {data && <section className="panel dashboard-breakdown">
        <div className="panel-heading"><h2>Doanh thu theo kênh</h2><span className="muted">Đơn đã thanh toán</span></div>
        {data.payments.filter((payment) => match(`${payment.channel === "telegram" ? "Telegram" : "Website"} ${payment.currency} đơn đã thanh toán`)).map((payment) => {
          const maximum = Math.max(1, ...data.payments.filter((item) => item.currency === payment.currency).map((item) => item.total));
          return <div className="dashboard-bar-row" key={`${payment.currency}:${payment.channel}`}>
            <span>{payment.channel === "telegram" ? "Telegram" : "Website"} · {payment.currency}</span>
            <div className="dashboard-track"><div style={{ width: `${Math.max(2, payment.total / maximum * 100)}%` }} /></div>
            <strong>{amountLabel(payment.total, payment.currency)}</strong>
          </div>;
        })}
        {data.payments.length === 0 && <p className="muted">Chưa có đơn đã thanh toán.</p>}
      </section>}
    </>
  );
}

/**
 * Trang quản trị trung tâm điều phối tất cả các phân hệ Admin của Tiệm Digital.
 */
export function AdminPage() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const path = window.location.pathname.split("/")[2];
    if (path === "mmo") return "products";
    if (path === "purchases") return "vendor-catalog";
    return labels.some(([id]) => id === path) ? (path as Tab) : "overview";
  });
  const [orderSection, setOrderSection] = useState<
    "customers" | "purchases" | "warranty"
  >("customers");
  const [prefillUserId, setPrefillUserId] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("session");
  const [adminUrl, setAdminUrl] = useState("/admin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tiem_digital_theme", next ? "dark" : "light");
    } catch {}
  };

  const navigateTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    window.history.pushState(null, "", `/admin/${nextTab}`);
    setError("");
    setPageSearch("");
  }, []);

  useEffect(() => {
    const restore = () => {
      const path = window.location.pathname.split("/")[2];
      const next =
        path === "mmo"
          ? "products"
          : path === "purchases"
            ? "vendor-catalog"
            : labels.some(([id]) => id === path)
              ? (path as Tab)
              : "overview";
      setTab(next);
      setError("");
      setPageSearch("");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    try {
      const identity = await api<Admin>("/api/admin/me");
      setError("");
      setAdmin(identity);
    } catch (error) {
      if ((error as Error & { status?: number }).status !== 401)
        setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmin();
    api<{ adminAuthMode: string; adminUrl: string }>("/api/public/config")
      .then((config) => {
        setAuthMode(config.adminAuthMode);
        setAdminUrl(config.adminUrl);
      })
      .catch(() => {});
  }, [loadAdmin]);

  return (
    <div className="platform platform-shell admin-shell">
      <header className="topbar">
        <div className="action-row">
          <a className="wordmark" href="/">
            tiệm<span>digital.</span> <small>admin</small>
          </a>
          <a className="admin-btn" href="/">
            Mở cửa hàng ↗
          </a>
        </div>
        <div className="action-row">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
          >
            {dark ? (
              <Sun size={15} aria-hidden="true" />
            ) : (
              <Moon size={15} aria-hidden="true" />
            )}
            {dark ? "Sáng" : "Tối"}
          </button>
          {admin && (
            <span className="admin-badge-role">
              {admin.username ?? admin.email} · {admin.role}
            </span>
          )}
          {admin &&
            (authMode === "access" ? (
              <a className="admin-btn" href="/cdn-cgi/access/logout">
                Đăng xuất Access
              </a>
            ) : (
              <button
                onClick={() =>
                  void run(async () => {
                    await api("/api/auth/sign-out", { body: {} });
                    setAdmin(null);
                  })
                }
              >
                Đăng xuất
              </button>
            ))}
        </div>
      </header>
      {!admin ? (
        <div>
          {loading ? (
            <section className="auth-card">
              <p role="status">Đang kiểm tra phiên đăng nhập…</p>
            </section>
          ) : authMode === "session" ? (
            <AuthForm admin onLogin={() => void loadAdmin()} />
          ) : (
            <section className="auth-card">
              <h1>Quản trị cửa hàng</h1>
              <a href={adminUrl}>Đăng nhập qua Cloudflare Access</a>
            </section>
          )}
          {error && <p className="notice error">{error}</p>}
        </div>
      ) : (
        <div className="workspace">
          <nav className="navigation" aria-label="Quản trị">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter(
                (id) =>
                  !["providers", "purchases", "vendor-catalog", "finance-report", "finance-transactions"].includes(id) ||
                  admin.role === "owner",
              );
              if (!visibleItems.length) return null;
              return (
                <div key={group.title} style={{ display: "contents" }}>
                  <span className="admin-nav-group-label">{group.title}</span>
                  {visibleItems.map((id) => {
                    const label =
                      labels.find(([tabId]) => tabId === id)?.[1] ?? id;
                    return (
                      <button
                        key={id}
                        className={tab === id ? "active" : ""}
                        onClick={() => navigateTab(id)}
                      >
                        <TabIcon tab={id} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <main className="content">
            <TableSearchContext.Provider value={pageSearch}>
            <div className="admin-page-header">
              <h1>{labels.find(([id]) => id === tab)?.[1]}</h1>
              <input className="admin-page-search" type="search" aria-label={tab === "overview" ? "Lọc số liệu tổng quan" : "Tìm trong bảng của trang"} placeholder={tab === "overview" ? "Lọc chỉ số, kênh bán…" : "Tìm trong các bảng…"} value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} />
              {busy && <span role="status" className="muted">Đang xử lý…</span>}
            </div>
            {error && (
              <div className="admin-status-bar">
                  <p role="alert" className="notice error">
                    {error}
                  </p>
              </div>
            )}
            {tab === "overview" && (
              <Overview run={run} query={pageSearch} />
            )}{" "}
            {tab === "customers" && (
              <Customers
                run={run}
                onAdjustWallet={(customerId) => {
                  setPrefillUserId(customerId);
                  navigateTab("finance");
                }}
              />
            )}{" "}
            {tab === "orders" && (
              <>
                {admin.role === "owner" && (
                  <div
                    className="action-row admin-section-nav"
                    aria-label="Các loại đơn hàng"
                  >
                    {(
                      [
                        ["customers", "Đơn khách & giao hàng"],
                        ["purchases", "Đơn nhập NCC"],
                        ["warranty", "Bảo hành"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        className={orderSection === id ? "primary" : ""}
                        onClick={() => setOrderSection(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {(admin.role !== "owner" || orderSection === "customers") && (
                  <>
                    {["owner", "support", "auditor"].includes(admin.role) && (
                      <FulfillmentAlerts
                        run={run}
                        canResolve={admin.role === "owner"}
                      />
                    )}
                    <Orders run={run} />
                  </>
                )}
                {admin.role === "owner" && orderSection === "purchases" && (
                  <PurchaseOrders
                    run={run}
                    ownerId={admin.userId ?? admin.email}
                  />
                )}
                {admin.role === "owner" && orderSection === "warranty" && (
                  <BusinessFinance run={run} warrantyOnly />
                )}
              </>
            )}{" "}
            {tab === "finance" && (
              <Finance
                admin={admin}
                run={run}
                initialUserId={prefillUserId}
              />
            )}{" "}
            {tab === "finance-report" && admin.role === "owner" && (
              <BusinessFinance run={run} reportOnly />
            )}
            {tab === "finance-transactions" && admin.role === "owner" && (
              <BusinessFinance run={run} transactionsOnly />
            )}
            {tab === "payment" && (
              <PaymentSettings admin={admin} run={run} />
            )}{" "}
            {tab === "products" &&
              (admin.role === "owner" ? (
                <CatalogProducts run={run} />
              ) : (
                <ReadOnlyProducts run={run} />
              ))}{" "}
            {(tab === "vendor-catalog" || tab === "purchases") &&
              admin.role === "owner" && (
                <VendorCatalog
                  run={run}
                  ownerId={admin.userId ?? admin.email}
                />
              )}
            {tab === "telegram" && <TelegramSettings run={run} owner={admin.role === "owner"} />}{" "}
            {tab === "audit" && <AuditPanel run={run} />}
            {tab === "providers" && admin.role === "owner" && (
              <Providers run={run} />
            )}
            </TableSearchContext.Provider>
          </main>
        </div>
      )}
    </div>
  );
}
