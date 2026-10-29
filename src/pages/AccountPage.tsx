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
import "../platform.css";

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: Record<string, unknown>): string;
      remove(id: string): void;
      reset(id: string): void;
    };
  }
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    api<{ turnstileSiteKey: string | null }>("/api/public/config")
      .then((config) => {
        if (!config.turnstileSiteKey || stopped) return;
        if (!document.querySelector("script[data-turnstile]")) {
          const script = document.createElement("script");
          script.src =
            "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.dataset.turnstile = "true";
          script.async = true;
          document.head.append(script);
        }
        function render() {
          if (stopped) return;
          if (window.turnstile && element.current) {
            widget.current = window.turnstile.render(element.current, {
              sitekey: config.turnstileSiteKey,
              action: "login",
              callback: setToken,
              "expired-callback": () => setToken(""),
            });
          } else timer = setTimeout(render, 100);
        }
        render();
      })
      .catch(() => setError("Không tải được cấu hình đăng nhập."));
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (widget.current) window.turnstile?.remove(widget.current);
    };
  }, []);
  return (
    <section className="auth-card">
      <span className="eyebrow">Tài khoản Tiệm Digital</span>
      <h1>Chào bạn.</h1>
      <p className="muted">
        Đăng nhập bằng mã email để quản lý số dư và nhận sản phẩm.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (!sent) {
              await api("/api/auth/email-otp/send-verification-otp", {
                body: { email, type: "sign-in" },
                headers: { "x-turnstile-token": token },
              });
              setSent(true);
            } else {
              await api("/api/auth/sign-in/email-otp", {
                body: { email, otp },
              });
              onLogin();
            }
          } catch (e) {
            setError((e as Error).message);
            if (widget.current) window.turnstile?.reset(widget.current);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            disabled={sent}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <div ref={element} />
        {sent && (
          <label>
            Mã gồm 6 số
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Đang xử lý…" : sent ? "Đăng nhập" : "Gửi mã đăng nhập"}
        </button>
        {sent && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setSent(false);
              setOtp("");
              if (widget.current) window.turnstile?.reset(widget.current);
            }}
          >
            Đổi email / gửi mã mới
          </button>
        )}
      </form>
    </section>
  );
}
type Tab = "overview" | "wallet" | "orders" | "telegram" | "security";
export function AccountPage() {
  const [actor, setActor] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [balance, setBalance] = useState(0);
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
  const [link, setLink] = useState<{ token: string; url: string } | null>(null);
  const [telegramId, setTelegramId] = useState("");
  const [linked, setLinked] = useState<string | null>(null);
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
  const refresh = useCallback(async () => {
    const user = await api<Customer>("/api/me");
    setActor(user);
    const [wallet, history, ledger, tg] = await Promise.all([
      api<{ balance: number }>("/api/me/wallet"),
      api<{ orders: PlatformOrder[] }>("/api/me/orders"),
      api<{ transactions: Journal[] }>("/api/me/wallet/transactions"),
      api<{ link: { telegram_id: string } | null }>("/api/me/telegram-link"),
    ]);
    setBalance(wallet.balance);
    setOrders(history.orders);
    setJournals(ledger.transactions);
    setLinked(tg.link?.telegram_id ?? null);
  }, []);
  useEffect(() => {
    refresh()
      .catch(() => setActor(null))
      .finally(() => setLoading(false));
  }, [refresh]);
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
    <div className="platform platform-shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          tiệm<span>digital.</span>
        </a>
        <div className="action-row">
          <a href="/">← Tiếp tục mua hàng</a>
          {actor && (
            <button
              onClick={() =>
                void run(async () => {
                  await api("/api/auth/sign-out", { body: {} });
                  setActor(null);
                  setOrders([]);
                  setJournals([]);
                  setDelivery(null);
                  setIntent(null);
                })
              }
            >
              Đăng xuất
            </button>
          )}
        </div>
      </header>
      {loading ? (
        <div className="auth-card">Đang tải tài khoản…</div>
      ) : !actor ? (
        <Login onLogin={() => void run(refresh)} />
      ) : (
        <div className="workspace">
          <nav className="navigation" aria-label="Tài khoản">
            {(
              [
                ["overview", "Tổng quan"],
                ["wallet", "Số dư & giao dịch"],
                ["orders", "Đơn hàng"],
                ["telegram", "Telegram"],
                ["security", "Phiên đăng nhập"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                className={tab === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === "security")
                    void run(async () =>
                      setSessions(await api("/api/auth/list-sessions")),
                    );
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <main className="content">
            <span className="eyebrow">Tài khoản của bạn</span>
            <h1>{actor.name || actor.email}</h1>
            <p className="muted">{actor.email}</p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {(tab === "overview" || tab === "wallet") && (
              <>
                <div className="balance-card">
                  <div>
                    <span className="eyebrow">Số dư khả dụng</span>
                    <div className="balance-value">{amountLabel(balance)}</div>
                    <p className="small">
                      Dùng thanh toán trên website và bot Telegram Tiệm Digital.
                    </p>
                  </div>
                  <button onClick={() => setTab("wallet")}>
                    Nạp tiền qua ngân hàng ↗
                  </button>
                </div>
                {tab === "overview" ? (
                  <section className="panel">
                    <h2>Mọi đơn hàng trong một tài khoản</h2>
                    <p>
                      Theo dõi trạng thái thanh toán và nhận sản phẩm ngay tại
                      đây. Website và Telegram dùng chung tài khoản, số dư và
                      thanh toán bằng QR ngân hàng.
                    </p>
                    <button onClick={() => setTab("orders")}>
                      Xem {orders.length} đơn hàng →
                    </button>
                  </section>
                ) : (
                  <>
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
                      {intent && (
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
                        <button onClick={() => void run(refresh)}>
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
              </>
            )}
            {tab === "orders" && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Đơn hàng của tôi</h2>
                  <button onClick={() => void run(refresh)}>Cập nhật</button>
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
                              {timeLabel(o.created_at)} · {o.channel}
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
            {tab === "telegram" && (
              <section className="panel stack">
                <h2>Liên kết Telegram</h2>
                {linked ? (
                  <>
                    <p>
                      Đã liên kết Telegram ID <strong>{linked}</strong>.
                    </p>
                    <button
                      onClick={() =>
                        void run(async () => {
                          await api("/api/me/telegram-link", {
                            method: "DELETE",
                          });
                          setLinked(null);
                        })
                      }
                    >
                      Hủy liên kết
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      Liên kết để mua hàng, thanh toán QR ngân hàng hoặc sử dụng
                      cùng số dư tài khoản ngay trong bot.
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setLink(
                            await api("/api/me/telegram-link", { body: {} }),
                          ),
                        )
                      }
                    >
                      Tạo liên kết một lần
                    </button>
                    {link && (
                      <>
                        <a href={link.url} target="_blank" rel="noreferrer">
                          Mở bot và bắt đầu liên kết ↗
                        </a>
                        <label>
                          Telegram ID bot vừa nhận
                          <input
                            inputMode="numeric"
                            value={telegramId}
                            onChange={(e) => setTelegramId(e.target.value)}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api("/api/me/telegram-link/confirm", {
                                body: { token: link.token, telegramId },
                              });
                              setLink(null);
                              await refresh();
                            })
                          }
                        >
                          Xác nhận liên kết
                        </button>
                      </>
                    )}
                  </>
                )}
              </section>
            )}
            {tab === "security" && (
              <section className="panel">
                <h2>Hồ sơ & phiên đăng nhập</h2>
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
  );
}
