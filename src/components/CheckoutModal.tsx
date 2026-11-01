import { useEffect, useRef, useState } from 'react';
import type { Purchase } from '../types';
import { api, amountLabel, type Customer, type PlatformOrder, type PaymentIntent } from '../services/platform';
import { PaymentQr } from './PaymentQr';
import { Dialog } from './Dialog';
import '../platform.css';

interface Props {
  onClose: () => void;
  purchase: Purchase;
  onOrderSuccess: (order: PlatformOrder) => void;
}
interface Recovery {
  quantity: number; name: string; phone: string; email: string;
  createKey: string; payKey: string; qrKey: string;
  order: PlatformOrder | null; method: 'wallet' | 'qr' | null;
  paymentAttempted: boolean; intent: PaymentIntent | null;
  renewalKeys?: Record<string, string>;
}

export function CheckoutModal({ onClose, purchase, onOrderSuccess }: Props) {
  const { product } = purchase;
  const [quantity, setQuantity] = useState(purchase.quantity);
  const [actor, setActor] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [authVersion, setAuthVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<PlatformOrder | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [choice, setChoice] = useState<'wallet' | 'qr' | null>(null);
  const [orderAttempted, setOrderAttempted] = useState(false);
  const [paymentAttempted, setPaymentAttempted] = useState(false);
  const createKey = useRef<string>(crypto.randomUUID());
  const payKey = useRef<string>(crypto.randomUUID());
  const qrKey = useRef<string>(crypto.randomUUID());
  const renewalKeys = useRef<Record<string, string>>({});
  const completed = useRef(false);
  const inFlight = useRef(false);
  const recovery = useRef<Recovery | null>(null);
  const recoveryKey = useRef('');
  const total = order?.total ?? product.selling_price * quantity;
  const method = choice ?? (balance !== null && balance >= total ? 'wallet' : 'qr');

  useEffect(() => {
    let stopped = false;
    api<Customer>('/api/me').then((user) => {
      if (stopped) return;
      setActor(user);
      setName(user.name);
      try {
        recoveryKey.current = `checkout:${user.id}:${product.id}`;
        const stored = sessionStorage.getItem(recoveryKey.current);
        if (stored) {
          const saved = JSON.parse(stored) as Recovery;
          recovery.current = saved;
          createKey.current = saved.createKey; payKey.current = saved.payKey; qrKey.current = saved.qrKey;
          renewalKeys.current = saved.renewalKeys ?? {};
          setQuantity(saved.quantity); setName(saved.name); setPhone(saved.phone);
          setOrder(saved.order); setChoice(saved.method); setPaymentAttempted(saved.paymentAttempted); setIntent(saved.intent); setOrderAttempted(true);
        }
      } catch { setError('Không thể khôi phục phiên thanh toán. Vui lòng kiểm tra Đơn hàng của tôi.'); }
      void api<{ balance: number }>('/api/me/wallet').then((wallet) => {
        if (!stopped) setBalance(wallet.balance);
      }).catch(() => { if (!stopped) setBalance(null); });
    }).catch((e: Error & { status?: number }) => {
      if (stopped) return;
      if (e.status !== 401) setError(e.message);
      setActor(null);
    }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [authVersion]);

  useEffect(() => {
    if (!actor) return;
    let stopped = false;
    const refreshBalance = () => {
      if (document.hidden) return;
      void api<{ balance: number }>('/api/me/wallet').then((wallet) => {
        if (!stopped) setBalance(wallet.balance);
      }).catch(() => { if (!stopped) setBalance(null); });
    };
    window.addEventListener('focus', refreshBalance);
    document.addEventListener('visibilitychange', refreshBalance);
    return () => {
      stopped = true;
      window.removeEventListener('focus', refreshBalance);
      document.removeEventListener('visibilitychange', refreshBalance);
    };
  }, [actor]);

  function finish(value: PlatformOrder) {
    if (value.payment_status !== 'PAID' || completed.current) return;
    completed.current = true;
    try { sessionStorage.removeItem(recoveryKey.current); } catch { /* Order remains available in history. */ }
    onOrderSuccess(value);
    onClose();
  }
  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function changeQuantity(value: string) {
    const next = Math.min(20, Math.max(1, Math.trunc(Number(value)) || 1));
    setQuantity(next);
    window.history.replaceState(null, '', `/?buy=${product.id}&quantity=${next}`);
  }
  const quantityField = <label>Số lượng<input type="number" min={1} max={20} step={1} required disabled={busy || orderAttempted} value={quantity} onChange={(event) => changeQuantity(event.target.value)} /></label>;

  async function confirmPayment() {
    if (!actor) return;
    const persist = (value: Recovery) => {
      sessionStorage.setItem(recoveryKey.current, JSON.stringify(value));
      recovery.current = value;
    };
    let saved = recovery.current;
    if (!saved) {
      saved = { quantity, name, phone, email: actor.email, createKey: createKey.current, payKey: payKey.current, qrKey: qrKey.current, order: null, method: null, paymentAttempted: false, intent: null };
      persist(saved);
    }
    let currentOrder = order;
    if (!currentOrder) {
      setOrderAttempted(true);
      try {
        currentOrder = await api<PlatformOrder>('/api/orders', {
          key: createKey.current,
          body: { items: [{ productId: product.id, quantity: saved.quantity }], customer: { fullName: saved.name, email: saved.email, phone: saved.phone } },
        });
      } catch (cause) {
        const status = (cause as { status?: number }).status;
        if (status && [400, 401, 403, 404, 422].includes(status)) {
          sessionStorage.removeItem(recoveryKey.current); recovery.current = null;
          createKey.current = crypto.randomUUID(); setOrderAttempted(false);
        }
        throw cause;
      }
      setOrder(currentOrder);
      saved = { ...saved, order: currentOrder }; persist(saved);
      if (currentOrder.total !== product.selling_price * quantity) {
        setError('Giá đã thay đổi. Vui lòng kiểm tra tổng tiền mới và xác nhận lại.');
        return;
      }
    } else if (paymentAttempted) {
      currentOrder = await api<PlatformOrder>(`/api/orders/${currentOrder.id}`);
      setOrder(currentOrder);
      if (currentOrder.payment_status === 'PAID') { finish(currentOrder); return; }
      if (currentOrder.payment_status !== 'UNPAID') {
        setError('Trạng thái thanh toán chưa rõ. Vui lòng kiểm tra lại trong Đơn hàng của tôi.');
        return;
      }
    }
    if (method === 'wallet' && (balance === null || balance < currentOrder.total)) {
      setError('Số dư chưa đủ hoặc chưa tải được. Vui lòng chọn QR.');
      return;
    }
    setChoice(method);
    setPaymentAttempted(true);
    saved = { ...saved, order: currentOrder, method, paymentAttempted: true }; persist(saved);
    if (method === 'wallet') {
      try {
        finish(await api<PlatformOrder>(`/api/orders/${currentOrder.id}/payments/wallet`, { key: payKey.current, body: {} }));
      } catch (cause) {
        if ((cause as { status?: number }).status === 409) {
          const checked = await api<PlatformOrder>(`/api/orders/${currentOrder.id}`);
          if (checked.payment_status === 'PAID') { finish(checked); return; }
          if (checked.payment_status === 'UNPAID') { setPaymentAttempted(false); saved = { ...saved, paymentAttempted: false }; persist(saved); }
        }
        throw cause;
      }
    } else {
      const next = await api<PaymentIntent>(`/api/orders/${currentOrder.id}/payments/qr`, { key: qrKey.current, body: {} });
      saved = { ...saved, intent: next }; persist(saved); setIntent(next);
    }
  }

  return <Dialog title="Thanh toán" onClose={() => { if (!busy) onClose(); }}>
    <div className="platform">
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading ? <p role="status">Đang tải tài khoản…</p> : !actor && error ?
        <button onClick={() => { setLoading(true); setError(''); setAuthVersion((value) => value + 1); }}>Thử lại</button> :
        !actor ? <div className="empty-state"><h3>Đăng nhập để mua hàng</h3><p>Đăng nhập để tiếp tục mua {product.name}. Sản phẩm và số lượng bạn chọn sẽ được giữ lại.</p>{quantityField}<a className="primary" href={`/account?buy=${product.id}&quantity=${quantity}`}>Đăng nhập để tiếp tục</a></div> :
        <div className="stack">
          <div className="receipt-lines"><div><span>{product.name} × {quantity}</span><strong>{amountLabel(total)}</strong></div></div>
          {!intent && <form onSubmit={(event) => { event.preventDefault(); void run(confirmPayment); }}>
            {quantityField}
            <label>Họ tên<input required disabled={busy || orderAttempted} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
            {actor.email && <label>Email nhận hàng<input disabled value={actor.email} /></label>}
            <label>Điện thoại / Zalo<input disabled={busy || orderAttempted} value={phone} maxLength={30} onChange={(event) => setPhone(event.target.value)} /></label>
            <p className="muted">Số dư khả dụng: {balance === null ? 'Chưa tải được' : amountLabel(balance)}{balance !== null && balance < total ? ' · Chưa đủ, có thể thanh toán toàn bộ bằng QR.' : ''}</p>
            <fieldset className="checkout-methods" disabled={busy || paymentAttempted}><legend>Thanh toán bằng</legend>
              <label><input type="radio" name="payment-method" checked={method === 'wallet'} disabled={balance === null || balance < total} onChange={() => setChoice('wallet')} /> Ví TiệmDigital</label>
              <label><input type="radio" name="payment-method" checked={method === 'qr'} onChange={() => setChoice('qr')} /> Chuyển khoản QR</label>
            </fieldset>
            {order && <p className="muted">Đơn {order.id} · Tổng tiền được xác nhận từ hệ thống.</p>}
            <button className="primary" disabled={busy || !product.in_stock || (method === 'wallet' && (balance === null || balance < total))}>{busy ? 'Đang xử lý…' : `Xác nhận thanh toán ${amountLabel(total)}`}</button>
          </form>}
          {intent && order && <>
            <div className="balance-strip"><span>{order.id}</span><strong>{amountLabel(order.total)}</strong></div>
            <PaymentQr key={intent.id} intent={intent} renewing={busy}
              onRenew={() => void run(async () => {
                const currentOrder = await api<PlatformOrder>(`/api/orders/${order.id}`);
                if (currentOrder.payment_status === 'PAID') { finish(currentOrder); return; }
                const currentIntent = await api<PaymentIntent>(`/api/intents/${intent.id}`);
                if (currentIntent.status !== 'EXPIRED') { setError('QR chưa được xác nhận hết hạn. Vui lòng chờ cập nhật trạng thái.'); return; }
                const key = renewalKeys.current[intent.id] ??= crypto.randomUUID();
                if (!recovery.current) throw new Error('Không tìm thấy phiên thanh toán. Hãy kiểm tra Đơn hàng của tôi.');
                sessionStorage.setItem(recoveryKey.current, JSON.stringify({ ...recovery.current, renewalKeys: renewalKeys.current }));
                const next = await api<PaymentIntent>(`/api/orders/${order.id}/payments/qr`, { key, body: {} });
                recovery.current = { ...recovery.current, renewalKeys: renewalKeys.current, intent: next };
                sessionStorage.setItem(recoveryKey.current, JSON.stringify(recovery.current));
                setIntent(next);
              })}
              onPaid={() => void run(async () => finish(await api<PlatformOrder>(`/api/orders/${order.id}`)))} />
            <button type="button" disabled={busy} onClick={() => void run(async () => {
              const current = await api<PlatformOrder>(`/api/orders/${order.id}`);
              if (current.payment_status === 'PAID') finish(current);
              else setError('Đơn chưa được xác nhận thanh toán. Vui lòng kiểm tra lại sau.');
            })}>Kiểm tra trạng thái đơn</button>
          </>}
          {order && <p className="muted">Đóng cửa sổ không xóa đơn. Bạn có thể tiếp tục trong mục Tài khoản.</p>}
        </div>}
    </div>
  </Dialog>;
}
