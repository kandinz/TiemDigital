import { useEffect, useRef, useState } from "react";
import type { Purchase } from "../types";
import {
  api,
  amountLabel,
  type Customer,
  type PlatformOrder,
  type PaymentIntent,
} from "../services/platform";
import { PaymentQr } from "./PaymentQr";
import { Dialog } from "./Dialog";
import "../platform.css";
interface Props {
  onClose: () => void;
  purchase: Purchase;
  onOrderSuccess: (order: PlatformOrder) => void;
}
export function CheckoutModal({
  onClose,
  purchase,
  onOrderSuccess,
}: Props) {
  const { product } = purchase;
  const [quantity, setQuantity] = useState(purchase.quantity);
  const [actor, setActor] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [authVersion, setAuthVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<PlatformOrder | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const createKey = useRef(crypto.randomUUID());
  const payKey = useRef(crypto.randomUUID());
  const qrKey = useRef(crypto.randomUUID());
  const completed = useRef(false);
  useEffect(() => {
    let stopped = false;
    api<Customer>("/api/me")
      .then((user) => {
        if (stopped) return;
        setActor(user);
        setName(user.name);
      })
      .catch((e: Error & { status?: number }) => {
        if (stopped) return;
        if (e.status !== 401) setError(e.message);
        setActor(null);
      }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [authVersion]);
  function finish(value: PlatformOrder) {
    if (value.payment_status !== "PAID" || completed.current) return;
    completed.current = true;
    onOrderSuccess(value);
    onClose();
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Thanh toán" onClose={onClose}>
      <div className="platform">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {loading ? <p role="status">Đang tải tài khoản…</p> : !actor && error ? (
          <button onClick={() => { setLoading(true); setError(''); setAuthVersion((value) => value + 1); }}>Thử lại</button>
        ) : !actor ? (
          <div className="empty-state">
            <h3>Đăng nhập để mua hàng</h3>
            <p>
              Đăng nhập để tiếp tục mua {product.name}. Sản phẩm và số lượng bạn chọn sẽ được giữ lại.
            </p>
            <a className="primary" href={`/account?buy=${product.id}&quantity=${quantity}`}>
              Đăng nhập để tiếp tục
            </a>
          </div>
        ) : (
          <>
            <div className="receipt-lines">
                <div>
                  <span>
                    {product.name} × {quantity}
                  </span>
                  <strong>
                    {amountLabel(product.selling_price * quantity)}
                  </strong>
                </div>
            </div>
            {!order ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () =>
                    setOrder(
                      await api<PlatformOrder>("/api/orders", {
                        key: createKey.current,
                        body: {
                          items: [{ productId: product.id, quantity }],
                          customer: {
                            fullName: name,
                            email: actor.email,
                            phone,
                          },
                        },
                      }),
                    ),
                  );
                }}
              >
                <label>Số lượng<input type="number" min={1} max={100} step={1} required disabled={busy} value={quantity} onChange={(event) => {
                  const next = Math.min(100, Math.max(1, Math.trunc(Number(event.target.value)) || 1));
                  setQuantity(next);
                  window.history.replaceState(null, '', `/?buy=${product.id}&quantity=${next}`);
                }} /></label>
                <label>
                  Họ tên
                  <input
                    required
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                {actor.email && <label>
                  Email nhận hàng
                  <input disabled value={actor.email} />
                </label>}
                <label>
                  Điện thoại / Zalo
                  <input
                    value={phone}
                    maxLength={30}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <p className="muted">
                  Giá chính thức được xác nhận khi tạo đơn.
                </p>
                <button className="primary" disabled={busy || !product.in_stock}>
                  {busy ? "Đang tạo đơn…" : "Tạo đơn và chọn thanh toán"}
                </button>
              </form>
            ) : (
              <div className="stack">
                <div className="balance-strip">
                  <span>{order.id}</span>
                  <strong>{amountLabel(order.total)}</strong>
                </div>
                <div className="action-row">
                  <button
                    disabled={busy || !!intent}
                    className="primary"
                    onClick={() =>
                      void run(async () =>
                        finish(
                          await api<PlatformOrder>(
                            `/api/orders/${order.id}/payments/wallet`,
                            { key: payKey.current, body: {} },
                          ),
                        ),
                      )
                    }
                  >
                    Thanh toán bằng số dư
                  </button>
                  <button
                    disabled={busy || !!intent}
                    onClick={() =>
                      void run(async () =>
                        setIntent(
                          await api<PaymentIntent>(
                            `/api/orders/${order.id}/payments/qr`,
                            { key: qrKey.current, body: {} },
                          ),
                        ),
                      )
                    }
                  >
                    Quét QR ngân hàng
                  </button>
                </div>
                {intent && (
                  <PaymentQr
                    key={intent.id}
                    intent={intent}
                    onPaid={() =>
                      void run(async () =>
                        finish(
                          await api<PlatformOrder>(`/api/orders/${order.id}`),
                        ),
                      )
                    }
                  />
                )}
                <p className="muted">
                  Đóng cửa sổ không xóa đơn. Bạn có thể tiếp tục trong mục Tài
                  khoản.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
