import { useState } from 'react';
import { api } from '../services/platform';
export function TelegramLogin({ onLogin }: { onLogin: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="telegram-login" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!token) setToken((await api<{ token: string }>('/api/auth/telegram/otp/start', { body: { identifier } })).token);
      else { await api('/api/auth/telegram/otp/complete', { body: { token, otp } }); onLogin(); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <label>Telegram User ID<input required inputMode="numeric" pattern="[0-9]{1,25}" disabled={!!token || busy} value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
    <p className="muted">Dùng User ID đã liên kết và đã mở bot Tiệm Digital.</p>
    {token && <><p role="status">Nếu User ID đã liên kết, OTP sẽ được gửi qua Telegram. Mã có hiệu lực 5 phút.</p><label>OTP Telegram<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} /></label></>}
    {error && <p role="alert" className="notice error">{error}</p>}
    <button disabled={busy}>{busy ? 'Đang xử lý…' : token ? 'Đăng nhập bằng OTP' : 'Gửi OTP Telegram'}</button>
    {token && <button type="button" disabled={busy} onClick={() => { setToken(''); setOtp(''); setError(''); }}>Đổi User ID / gửi lại</button>}
  </form>;
}
