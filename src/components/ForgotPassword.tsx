import { useState } from 'react';
import { api } from '../services/platform';
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState('auto');
  const [token, setToken] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  return <section className="auth-card"><button type="button" className="quiet" onClick={onBack}>← Đăng nhập</button><h1>Quên mật khẩu</h1>
    {done ? <p role="status">Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.</p> : <form onSubmit={async e => {
      e.preventDefault(); setError(''); if (token && password !== confirmation) { setError('Mật khẩu nhập lại chưa khớp.'); return; } setBusy(true);
      try {
        if (!token) setToken((await api<{ token: string }>('/api/auth/recovery/start', { body: { identifier, channel } })).token);
        else { await api('/api/auth/recovery/complete', { body: { token, otp, newPassword: password } }); setDone(true); }
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><fieldset disabled={busy}>
      <label>Username, email hoặc Telegram User ID<input required maxLength={254} disabled={!!token} value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
      <label>Nhận OTP qua<select disabled={!!token} value={channel} onChange={e => setChannel(e.target.value)}><option value="auto">Tự động theo liên kết tài khoản</option><option value="email">Email</option><option value="telegram">Telegram</option></select></label>
      {token && <><p role="status">Nếu tài khoản có liên kết phù hợp, OTP đã được gửi. Mã có hiệu lực 5 phút.</p><label>OTP<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} /></label><label>Mật khẩu mới<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label><label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></>}
      {error && <p role="alert" className="notice error">{error}</p>}<button disabled={busy}>{busy ? 'Đang xử lý…' : token ? 'Đặt lại mật khẩu' : 'Gửi OTP'}</button>
      {token && <button type="button" onClick={() => { setToken(''); setOtp(''); }}>Gửi lại / đổi thông tin</button>}
    </fieldset></form>}
  </section>;
}
