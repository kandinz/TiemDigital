import { amountLabel, type PlatformOrder } from '../services/platform';
import { Dialog } from './Dialog';

export function OrderSuccessModal({ order, onClose }: { order: PlatformOrder; onClose: () => void }) {
  return <Dialog title="Thanh toán thành công" onClose={onClose}>
    <div className="platform stack">
      <p>Đã thanh toán <strong>{amountLabel(order.total)}</strong> cho đơn <strong>{order.id}</strong>.</p>
      <p className="muted">Theo dõi và nhận sản phẩm trong đơn hàng của bạn.</p>
      <a className="primary" href="/account#orders">Xem đơn hàng</a>
      <button onClick={onClose}>Tiếp tục mua hàng</button>
    </div>
  </Dialog>;
}
