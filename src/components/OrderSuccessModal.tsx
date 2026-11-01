import { useEffect, useState } from 'react';
import { api, amountLabel, fulfillmentLabel, type PlatformOrder } from '../services/platform';
import { Dialog } from './Dialog';

export function OrderSuccessModal({ order, onClose }: { order: PlatformOrder; onClose: () => void }) {
  const [progress, setProgress] = useState(order);
  const [delivery, setDelivery] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const current = await api<PlatformOrder>(`/api/orders/${order.id}`);
        if (stopped) return;
        setProgress(current);
        setMessage('');
        let deliveryReady = false;
        try {
          const data = await api<{ value: string }>(`/api/orders/${order.id}/delivery`);
          if (!stopped) { setDelivery(data.value); deliveryReady = true; }
        } catch (error) {
          if (!stopped && (error as Error & { status?: number }).status !== 409) {
            setMessage('Chưa tải được dữ liệu giao hàng. Bạn có thể xem lại trong Đơn hàng của tôi.');
          }
        }
        if (!stopped && (current.fulfillment_status !== 'DELIVERED' || !deliveryReady)) timer = setTimeout(() => void refresh(), 5000);
      } catch {
        if (!stopped) {
          setMessage('Chưa cập nhật được tiến trình giao hàng. Bạn có thể xem lại trong Đơn hàng của tôi.');
          timer = setTimeout(() => void refresh(), 10000);
        }
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [order.id]);

  async function copyDelivery() {
    try { await navigator.clipboard.writeText(delivery); setMessage('Đã sao chép dữ liệu.'); }
    catch { setMessage('Không sao chép được. Hãy chọn dữ liệu bên dưới để sao chép.'); }
  }

  return <Dialog title="Thanh toán thành công" onClose={onClose}>
    <div className="platform stack">
      <p>Đã thanh toán <strong>{amountLabel(order.total)}</strong> cho đơn <strong>{order.id}</strong>.</p>
      <p role="status">Giao hàng: <strong>{fulfillmentLabel(progress.fulfillment_status)}</strong></p>
      {progress.fulfillments?.map((item) => <p key={item.product_id}>{item.name}: đã giao {item.delivered_quantity}/{item.quantity}</p>)}
      {delivery && <><h3>Dữ liệu đã nhận</h3><pre className="delivery-value">{delivery}</pre><button type="button" onClick={() => void copyDelivery()}>Sao chép dữ liệu</button></>}
      {message && <p className="notice" role="status">{message}</p>}
      <p className="muted">Bạn có thể xem lại đơn và dữ liệu đã nhận trong Đơn hàng của tôi.</p>
      <a className="primary" href="/account#orders">Xem đơn hàng</a>
      <button onClick={onClose}>Tiếp tục mua hàng</button>
    </div>
  </Dialog>;
}
