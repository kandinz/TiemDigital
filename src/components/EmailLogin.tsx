import { useEffect, useRef, useState } from "react";
import { api } from "../services/platform";

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: Record<string, unknown>): string;
      remove(id: string): void;
      reset(id: string): void;
    };
  }
}
export function EmailLogin({ onLogin, onBack }: { onLogin: () => void; onBack: () => void }) {
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
      <button type="button" className="quiet" onClick={onBack}>← Đăng nhập bằng mật khẩu</button>
      <h1>Đăng nhập bằng mã email</h1>
      <p className="muted">
        Nhận mã đăng nhập qua email để mua hàng và quản lý số dư.
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
