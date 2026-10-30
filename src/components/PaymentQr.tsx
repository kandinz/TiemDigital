import { useEffect, useRef, useState } from "react";
import {
  api,
  amountLabel,
  paymentLabel,
  type PaymentIntent,
} from "../services/platform";
export function PaymentQr({
  intent: initial,
  onPaid,
  onRenew,
  renewing = false,
}: {
  intent: PaymentIntent;
  onPaid?: () => void;
  onRenew?: () => void;
  renewing?: boolean;
}) {
  const [intent, setIntent] = useState(initial);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [time, setTime] = useState(() => Date.now());
  const onPaidRef = useRef(onPaid);
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 3000;
    async function poll() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const next = await api<PaymentIntent>(`/api/intents/${initial.id}`);
          if (stopped) return;
          setIntent(next);
          setError("");
          setTime(Date.now());
          if (next.status === "SUCCEEDED") {
            onPaidRef.current?.();
            return;
          }
          if (next.status === "EXPIRED") return;
          delay = 3000;
        } catch {
          if (!stopped)
            setError(
              "Chưa cập nhật được trạng thái. Tra cứu lại trong Tài khoản.",
            );
          delay = Math.min(delay * 2, 30000);
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [initial.id]);
  const expired = intent.status !== "SUCCEEDED" &&
    (time >= intent.expiresAt * 1000 || intent.status === "EXPIRED");
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setError("Không sao chép được. Hãy sao chép thông tin bên dưới.");
    }
  }
  return (
    <div className="qr-panel stack">
      <span className={`status ${intent.status === "SUCCEEDED" ? "good" : ""}`}>
        {paymentLabel(intent.status)}
      </span>
      {intent.status === "PENDING" && !expired && (
        <img
          src={intent.qrUrl}
          width="256"
          height="256"
          alt={`QR chuyển ${amountLabel(intent.amount)} tới ${intent.bankName}`}
          onError={() =>
            setError("Chưa tải được QR. Dùng thông tin chuyển khoản bên dưới.")
          }
        />
      )}
      <h3>{amountLabel(intent.amount)}</h3>
      {intent.status === "PENDING" && !expired && <p className="muted">QR còn hiệu lực {Math.ceil((intent.expiresAt * 1000 - time) / 60000)} phút</p>}
      {expired && onRenew && <button type="button" disabled={renewing} onClick={onRenew}>{renewing ? "Đang kiểm tra…" : "Tạo QR mới"}</button>}
      <dl>
        <dt>Ngân hàng</dt>
        <dd>{intent.bankName}</dd>
        <dt>Tài khoản</dt>
        <dd>
          <button
            className="copy"
            onClick={() => void copy(intent.accountNumber)}
          >
            {intent.accountNumber} {copied === intent.accountNumber ? "✓" : "⧉"}
          </button>
        </dd>
        <dt>Chủ tài khoản</dt>
        <dd>{intent.accountHolder}</dd>
        <dt>Nội dung bắt buộc</dt>
        <dd>
          <button className="copy" onClick={() => void copy(intent.memo)}>
            {intent.memo} {copied === intent.memo ? "✓" : "⧉"}
          </button>
        </dd>
      </dl>
      <p className="muted">
        {intent.status === "SUCCEEDED" ? "Đã xác nhận thanh toán." : expired
          ? "Yêu cầu đã hết hạn. Không tiếp tục chuyển tiền; khoản đến muộn cần đối soát."
          : "Chuyển đúng số tiền và giữ nguyên nội dung. Hệ thống tự xác nhận khi nhận được giao dịch."}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
