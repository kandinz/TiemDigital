import { useEffect, useRef, useState } from "react";
import type { CartItem, Order, PromoCode } from "../types";
import {
  api,
  amountLabel,
  type Customer,
  type PlatformOrder,
  type PaymentIntent,
} from "../services/platform";
import { PaymentQr } from "./PaymentQr";
import "../platform.css";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  promo?: PromoCode;
  discountAmount?: number;
  onOrderSuccess: (order: Order) => void;
}
export function CheckoutModal({
  isOpen,
  onClose,
  items,
  promo,
  onOrderSuccess,
}: Props) {
  const [actor, setActor] = useState<Customer | null>(null);
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
    api<Customer>("/api/me")
      .then((user) => {
        setActor(user);
        setName(user.name);
      })
      .catch(() => setActor(null));
  }, [isOpen]);
  function finish(value: PlatformOrder) {
    if (value.payment_status !== "PAID" || completed.current) return;
    completed.current = true;
    onOrderSuccess({
      orderId: value.id,
      createdAt: new Date(value.created_at * 1000).toISOString(),
      customer: value.customer,
      items,
      subtotal: value.total,
      discountAmount: 0,
      total: value.total,
      paymentMethod: "vietqr",
      status: "processing",
    });
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
    <div
      className="platform modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <section className="dialog-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Tiệm Digital · Thanh toán</span>
            <h2 id="checkout-title">Hoàn tất đơn hàng</h2>
          </div>
          <button className="quiet" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!actor ? (
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
                          ...(promo ? { promoCode: promo.code } : {}),
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
      </section>
    </div>
  );
}
