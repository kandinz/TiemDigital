import { useState } from "react";
import {
  api,
  amountLabel,
  paymentLabel,
  type PlatformOrder,
} from "../services/platform";
export function OrderTrackerModal({
  isOpen,
  onClose,
  initialCode = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [order, setOrder] = useState<PlatformOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;
  return (
    <div
      className="platform modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Tra cứu đơn"
    >
      <section className="dialog-card">
        <div className="panel-heading">
          <h2>Tra cứu đơn của bạn</h2>
          <button aria-label="Đóng" onClick={onClose}>
            ✕
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setOrder(null);
            setBusy(true);
            try {
              setOrder(
                await api(
                  `/api/orders/${encodeURIComponent(code.replace("#", "").trim().toUpperCase())}`,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Mã đơn
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            Tra cứu
          </button>
        </form>
        {error && <p className="notice error">{error}</p>}
        {order && (
          <div className="stack">
            <h3>{order.id}</h3>
            <strong>{amountLabel(order.total, order.currency)}</strong>
            <p>{paymentLabel(order.payment_status)}</p>
            <p>
              {order.fulfillment_status === "DELIVERED"
                ? "Đã giao sản phẩm"
                : "Đang xử lý giao hàng"}
            </p>
          </div>
        )}
        <a href="/account">Đăng nhập và xem tất cả đơn hàng →</a>
      </section>
    </div>
  );
}
