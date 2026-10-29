import { useEffect, useRef, useState } from "react";
import type { CartItem } from "../types";
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
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onOrderSuccess: (order: PlatformOrder) => void;
}
export function CheckoutModal({
  isOpen,
  onClose,
  items,
  onOrderSuccess,
}: Props) {
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
    if (!isOpen) return;
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
  }, [isOpen, authVersion]);
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
  if (!isOpen) return null;
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
              Đơn hàng và số dư được bảo vệ trong tài khoản. Giỏ hàng hiện tại
              sẽ được giữ lại.
            </p>
            <a className="primary" href="/account">
              Đăng nhập bằng email
            </a>
          </div>
        ) : (
          <>
            <div className="receipt-lines">
              {items.map((i) => (
                <div key={i.product.id}>
                  <span>
                    {i.product.name} × {i.quantity}
                  </span>
                  <strong>
                    {amountLabel(i.product.selling_price * i.quantity)}
                  </strong>
                </div>
              ))}
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
                          items: items.map((i) => ({
                            productId: i.product.id,
                            quantity: i.quantity,
                          })),
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
                <label>
                  Họ tên
                  <input
                    required
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Email nhận hàng
                  <input disabled value={actor.email} />
                </label>
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
                <button className="primary" disabled={busy || !items.length}>
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
