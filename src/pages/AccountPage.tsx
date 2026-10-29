import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  amountLabel,
  paymentLabel,
  timeLabel,
  type Customer,
  type Journal,
  type PaymentIntent,
  type PlatformOrder,
} from "../services/platform";
import { PaymentQr } from "../components/PaymentQr";
import { AuthForm } from "../components/AuthForm";
import { Header } from "../components/Header";
import { SupportButton } from "../components/SupportButton";
import { readPurchaseRequest } from "../utils/purchase";
import "../platform.css";

type Tab = "wallet" | "orders" | "security";
const currentTab = (): Tab => window.location.hash === '#wallet' ? 'wallet' : window.location.hash === '#security' ? 'security' : 'orders';
export function AccountPage() {
  const [actor, setActor] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(currentTab);
  const [balance, setBalance] = useState<number | null>(null);
  const [orders, setOrders] = useState<PlatformOrder[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(100000);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [delivery, setDelivery] = useState<{
    orderId: string;
    value: string;
  } | null>(null);
  const [sessions, setSessions] = useState<
    { token: string; id: string; userAgent?: string; createdAt: string }[]
  >([]);
  const [profileName, setProfileName] = useState("");
  const operationKeys = useRef<Record<string, string>>({});
  function key(scope: string) {
    return (
      operationKeys.current[scope] ??
      (operationKeys.current[scope] = crypto.randomUUID())
    );
  }
  const refresh = useCallback(async (currentUser?: Customer) => {
    const user = currentUser ?? await api<Customer>("/api/me");
    setActor(user);
    setProfileName(user.name);
    const [wallet, history, ledger] = await Promise.all([
      api<{ balance: number }>("/api/me/wallet"),
      api<{ orders: PlatformOrder[] }>("/api/me/orders"),
      api<{ transactions: Journal[] }>("/api/me/wallet/transactions"),
    ]);
    setBalance(wallet.balance);
    setOrders(history.orders);
    setJournals(ledger.transactions);
  }, []);
  useEffect(() => {
    api<Customer>('/api/me').then(refresh)
      .catch((e: Error & { status?: number }) => {
        if (e.status === 401) setActor(null);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    const changeTab = () => setTab(currentTab());
    window.addEventListener('hashchange', changeTab);
    return () => window.removeEventListener('hashchange', changeTab);
  }, []);
  useEffect(() => {
    if (actor && tab === 'security') {
      let stopped = false;
      api<typeof sessions>('/api/auth/list-sessions').then((value) => {
        if (!stopped) setSessions(value);
      }).catch((e: Error) => { if (!stopped) setError(e.message); });
      return () => { stopped = true; };
    }
  }, [actor, tab]);
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
  const paid = useCallback(() => {
    for (const pending of Object.keys(operationKeys.current))
      if (pending.startsWith("topup:")) delete operationKeys.current[pending];
    setIntent((current) =>
      current ? { ...current, status: "SUCCEEDED" } : null,
    );
    void run(async () => {
      await refresh();
    });
  }, [refresh]);
  return (
    <div className="shop-shell">
      <Header account={actor ? { ...actor, balance } : null} />
      <div className="platform platform-shell account-shell">
      {loading ? (
        <div className="auth-card">Đang tải tài khoản…</div>
      ) : !actor && error ? (
        <main className="auth-card"><p className="notice error" role="alert">{error}</p><button onClick={() => void run(async () => { try { await refresh(); } catch (e) { if ((e as { status?: number }).status !== 401) throw e; } })}>Thử lại</button></main>
      ) : !actor ? (
        <AuthForm onLogin={() => void run(async () => {
          await refresh();
          const purchase = readPurchaseRequest(window.location.search);
          if (purchase) window.location.assign(`/?buy=${purchase.productId}&quantity=${purchase.quantity}`);
        })} />
      ) : (
        <div className="workspace">
          <nav className="navigation" aria-label="Tài khoản">
            {(
              [
                ["orders", "Đơn hàng"],
                ["security", "Hồ sơ & bảo mật"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? 'page' : undefined}
                key={id}
                onClick={() => {
                  setTab(id);
                  window.location.hash = id;
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <main className="content">
            <div className="panel-heading account-heading"><div><h1>{tab === 'wallet' ? 'Số dư' : tab === 'security' ? 'Hồ sơ & bảo mật' : 'Đơn hàng'}</h1><p className="muted">{actor.username || actor.email || actor.name}</p></div>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {tab === "wallet" && (
              <>
                <div className="balance-card">
                  <div>
                    <span className="eyebrow">Số dư khả dụng</span>
                    <div className="balance-value">{balance === null ? 'Đang tải…' : amountLabel(balance)}</div>
                  </div>
                </div>
                <section className="panel">
                  <h2>Nạp số dư</h2>
                  <p className="muted">
                    Tiền chỉ được cộng sau khi xác nhận giao dịch ngân hàng.
                    Nạp tiền không tự thanh toán đơn hàng.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        let next = await api<PaymentIntent>(
                          "/api/me/topups",
                          {
                            key: key(`topup:${amount}`),
                            body: { amount },
                          },
                        );
                        if (
                          next.status === "SUCCEEDED" ||
                          next.status === "EXPIRED"
                        ) {
                          delete operationKeys.current[`topup:${amount}`];
                          next = await api<PaymentIntent>(
                            "/api/me/topups",
                            {
                              key: key(`topup:${amount}`),
                              body: { amount },
                            },
                          );
                        }
                        setIntent(next);
                      });
                    }}
                  >
                    <label>
                      Số tiền nạp (VND)
                      <input
                        type="number"
                        required
                        min={10000}
                        step={1000}
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Tạo QR nạp tiền
                    </button>
                  </form>
                  {intent?.purpose === 'TOPUP' && (
                    <PaymentQr
                      key={intent.id}
                      intent={intent}
                      onPaid={paid}
                    />
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Sổ giao dịch</h2>
                    <button disabled={busy} onClick={() => void run(refresh)}>
                      Cập nhật
                    </button>
                  </div>
                  {!journals.length ? (
                    <p className="empty-state">
                      Chưa có giao dịch. Khoản nạp thành công sẽ xuất hiện ở
                      đây.
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Thời gian</th>
                            <th>Loại</th>
                            <th>Nội dung</th>
                            <th>Thay đổi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {journals.map((j) => (
                            <tr key={j.id}>
                              <td>{timeLabel(j.created_at)}</td>
                              <td>{j.kind}</td>
                              <td className="mono">{j.memo}</td>
                              <td
                                className={
                                  j.wallet_delta > 0 ? "positive" : "danger"
                                }
                              >
                                {j.wallet_delta > 0 ? "+" : ""}
                                {amountLabel(j.wallet_delta)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
            {tab === "orders" && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Đơn hàng của tôi</h2>
                  <button disabled={busy} onClick={() => void run(refresh)}>Cập nhật</button>
                </div>
                {!orders.length ? (
                  <p className="empty-state">
                    Bạn chưa có đơn hàng. <a href="/">Khám phá sản phẩm →</a>
                  </p>
                ) : (
                  <div className="stack">
                    {orders.map((o) => (
                      <article key={o.id} className="panel">
                        <div className="panel-heading">
                          <div>
                            <span className="mono">{o.id}</span>
                            <p>
                              {o.items
                                .map((i) => `${i.name} × ${i.quantity}`)
                                .join(", ")}
                            </p>
                            <small className="muted">
                              {timeLabel(o.created_at)}
                            </small>
                          </div>
                          <strong>{amountLabel(o.total, o.currency)}</strong>
                        </div>
                        <span
                          className={`status ${o.payment_status === "PAID" ? "good" : ""}`}
                        >
                          {paymentLabel(o.payment_status)}
                        </span>
                        <div className="action-row">
                          {o.currency === "VND" &&
                            o.payment_status === "UNPAID" && (
                              <>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await api(
                                        `/api/orders/${o.id}/payments/wallet`,
                                        {
                                          key: key(`wallet:${o.id}`),
                                          body: {},
                                        },
                                      );
                                      await refresh();
                                    })
                                  }
                                >
                                  Trả bằng số dư
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () =>
                                      setIntent(
                                        await api(
                                          `/api/orders/${o.id}/payments/qr`,
                                          { key: key(`qr:${o.id}`), body: {} },
                                        ),
                                      ),
                                    )
                                  }
                                >
                                  Quét QR
                                </button>
                              </>
                            )}
                          {o.payment_status === "PAID" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const value = await api<{ value: string }>(
                                    `/api/orders/${o.id}/delivery`,
                                  );
                                  setDelivery({
                                    orderId: o.id,
                                    value: value.value,
                                  });
                                })
                              }
                            >
                              Nhận sản phẩm
                            </button>
                          )}
                        </div>
                        {intent?.orderId === o.id && (
                          <PaymentQr
                            key={intent.id}
                            intent={intent}
                            onPaid={paid}
                          />
                        )}
                      </article>
                    ))}
                  </div>
                )}
                {delivery && (
                  <div className="panel stack">
                    <div className="panel-heading">
                      <h3>Sản phẩm · {delivery.orderId}</h3>
                      <button onClick={() => setDelivery(null)}>Ẩn</button>
                    </div>
                    <pre className="code-block">{delivery.value}</pre>
                    <p className="muted">
                      Giữ riêng thông tin này. Không chia sẻ key hoặc mật khẩu
                      cho người khác.
                    </p>
                  </div>
                )}
              </section>
            )}
            {tab === "security" && (
              <section className="panel">
                <h2>Tên hiển thị</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api("/api/auth/update-user", {
                        body: { name: profileName },
                      });
                      await refresh();
                    });
                  }}
                >
                  <label>
                    Tên hiển thị
                    <input
                      required
                      maxLength={100}
                      value={profileName}
                      placeholder={actor.name}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Cập nhật hồ sơ</button>
                </form>
                <p className="muted">
                  Thu hồi phiên trên thiết bị không còn sử dụng.
                </p>
                {sessions.map((s) => (
                  <div className="receipt-lines" key={s.id}>
                    <p>{s.userAgent || "Thiết bị không xác định"}</p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api("/api/auth/revoke-session", {
                            body: { token: s.token },
                          });
                          setSessions(await api("/api/auth/list-sessions"));
                        })
                      }
                    >
                      Thu hồi phiên
                    </button>
                  </div>
                ))}
              </section>
            )}
          </main>
        </div>
      )}
      </div>
      <SupportButton />
    </div>
  );
}
