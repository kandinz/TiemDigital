import type { Order } from "../types";
import { amountLabel } from "../services/platform";
export function OrderSuccessModal({
  order,
  onClose,
  onTrackOrder,
}: {
  order: Order | null;
  onClose: () => void;
  onTrackOrder: (code: string) => void;
}) {
  if (!order) return null;
  return (
    <div
      className="platform modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Thanh toán thành công"
    >
      <section className="dialog-card stack">
        <span className="status good">Đã thanh toán</span>
        <h2>Đã nhận {amountLabel(order.total)}</h2>
        <p>
          Đơn <strong>{order.orderId}</strong> đang được chuẩn bị. Sản phẩm sẽ
          xuất hiện trong tài khoản khi giao hoàn tất.
        </p>
        <a className="primary" href="/account">
          Mở tài khoản để nhận hàng
        </a>
        <button
          onClick={() => {
            onTrackOrder(order.orderId);
            onClose();
          }}
        >
          Theo dõi đơn
        </button>
        <button onClick={onClose}>Tiếp tục mua sắm</button>
      </section>
    </div>
  );
}
