import { useCallback, useEffect, useState } from "react";
import { api, timeLabel } from "../../services/platform";
import { SmartTable } from "./SmartTable";

type Run = (task: () => Promise<void>) => Promise<void>;
interface Settings { adminChatId: string; orderPaid: boolean; orderDelivered: boolean; orderPartial: boolean; adminAlert: boolean }
interface OutboxEvent { id: string; kind: string; status: string; attempts: number; error: string | null; created_at: number }
interface Status { telegram: boolean; telegramWebhook: boolean; telegramUsername: string | null; outbox: OutboxEvent[] }

export function TelegramSettings({ run, owner }: { run: Run; owner: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [webhook, setWebhook] = useState<{ url: string; pending: number; lastError: string } | null>(null);
  const load = useCallback(async () => {
    const [nextStatus, nextSettings] = await Promise.all([
      api<Status>("/api/admin/status"),
      owner ? api<Settings>("/api/admin/telegram/settings") : Promise.resolve(null),
    ]);
    setStatus(nextStatus);
    setSettings(nextSettings);
  }, [owner]);
  useEffect(() => { void run(load); }, [run, load]);
  const ready = Boolean(status?.telegram && status?.telegramWebhook && status?.telegramUsername);
  return <div className="telegram-settings">
    <div className="metric-grid">
      <div className="metric"><span>Bot Telegram</span><strong>{status?.telegramUsername ? `@${status.telegramUsername}` : "Chưa cấu hình"}</strong></div>
      <div className="metric"><span>Kết nối</span><strong>{ready ? "Sẵn sàng" : "Cần cấu hình"}</strong></div>
      <div className="metric"><span>Thông báo chờ xử lý</span><strong>{status?.outbox.length ?? 0}</strong></div>
    </div>
    {status && !ready && <p role="alert" className="notice error">Thiếu cấu hình: {[!status.telegram && "TELEGRAM_BOT_TOKEN", !status.telegramWebhook && "TELEGRAM_WEBHOOK_SECRET", !status.telegramUsername && "TELEGRAM_BOT_USERNAME"].filter(Boolean).join(", ")}. Cập nhật biến môi trường của hệ thống để kết nối bot.</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {owner && settings && <section className="panel">
      <div className="panel-heading"><h2>Cài đặt thông báo</h2><div className="action-row"><button type="button" disabled={!status?.telegram || !status?.telegramWebhook} onClick={() => void run(async () => { await api("/api/admin/telegram/webhook", { body: {} }); setNotice("Đã đăng ký webhook và danh sách lệnh của bot."); await load(); })}>Cài webhook & lệnh bot</button><button type="button" disabled={!status?.telegram} onClick={() => void run(async () => setWebhook(await api("/api/admin/telegram/webhook-info")))}>Kiểm tra webhook</button><button type="button" disabled={!status?.telegram || !settings.adminChatId} onClick={() => void run(async () => { await api("/api/admin/telegram/test", { body: {} }); setNotice("Đã gửi tin thử tới Chat ID quản trị."); })}>Gửi thử</button></div></div>
      {webhook && <p className="muted">Webhook: {webhook.url || "Chưa đăng ký"} · Đang chờ: {webhook.pending}{webhook.lastError && ` · Lỗi: ${webhook.lastError}`}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api("/api/admin/telegram/settings", { method: "PUT", body: settings }); setNotice("Đã lưu cài đặt Telegram."); await load(); }); }}>
        <div className="admin-toolbar"><label>Chat ID quản trị<input pattern="-?[0-9]{1,25}" value={settings.adminChatId} onChange={(event) => setSettings({ ...settings, adminChatId: event.target.value })} placeholder="Chat ID cá nhân hoặc nhóm" /></label><button className="primary">Lưu cài đặt</button></div>
        <div className="telegram-options">
          {([
            ["orderPaid", "Đơn đã thanh toán"],
            ["orderDelivered", "Đơn đã giao"],
            ["orderPartial", "Đơn giao một phần"],
            ["adminAlert", "Cảnh báo cần xử lý cho quản trị"],
          ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />{label}</label>)}
        </div>
      </form>
      <form className="admin-toolbar telegram-send" onSubmit={(event) => { event.preventDefault(); void run(async () => { await api("/api/admin/telegram/send", { body: { text: message } }); setMessage(""); setNotice("Đã gửi thông báo tới Chat ID quản trị."); }); }}>
        <input aria-label="Nội dung thông báo Telegram" maxLength={4096} placeholder="Viết thông báo gửi tới Chat ID quản trị…" value={message} onChange={(event) => setMessage(event.target.value)} />
        <button type="submit" disabled={!status?.telegram || !settings.adminChatId || !message.trim()}>Gửi thông báo</button>
      </form>
    </section>}
    <section className="panel"><div className="panel-heading"><h2>Hàng đợi thông báo</h2><button type="button" onClick={() => void run(async () => { await api("/api/admin/maintenance", { body: {} }); await load(); })}>Xử lý hàng đợi</button></div>
      <div className="table-wrap"><SmartTable><thead><tr><th>Thời gian</th><th>Mã</th><th>Loại</th><th>Trạng thái</th><th>Lỗi / số lần</th><th>Thao tác</th></tr></thead><tbody>{(status?.outbox ?? []).map((event) => <tr key={event.id}><td>{timeLabel(event.created_at)}</td><td className="mono">{event.id}</td><td>{event.kind}</td><td><span className="status">{event.status}</span></td><td>{event.error || "—"} · {event.attempts}</td><td><button onClick={() => void run(async () => { await api(`/api/admin/outbox/${encodeURIComponent(event.id)}/retry`, { body: {} }); await load(); })}>Gửi lại</button></td></tr>)}</tbody></SmartTable></div>
      {status?.outbox.length === 0 && <p className="muted">Không có thông báo tồn đọng.</p>}
    </section>
    <section className="panel"><h2>Chức năng bot</h2><div className="bot-capabilities"><span>/products · chọn và mua hàng</span><span>/profile · tài khoản và số dư</span><span>/orders · theo dõi đơn</span><span>/topup · tạo QR nạp tiền</span><span>/support · hỗ trợ</span></div></section>
  </div>;
}
