import { useState } from 'react';
import { api } from '../services/platform';
import { EmailLogin } from './EmailLogin';
import { TelegramLogin } from './TelegramLogin';

export function AuthForm({ onLogin, admin = false }: { onLogin: () => void; admin?: boolean }) {
  const [mode, setMode] = useState<'login' | 'register' | 'email'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const registering = mode === 'register';

  if (mode === 'email') return <EmailLogin onLogin={onLogin} onBack={() => setMode('login')} />;
  return <section className="auth-card">
    {!admin && <div className="auth-modes" role="group" aria-label="Chọn đăng nhập hoặc đăng ký">
      <button type="button" aria-pressed={!registering} onClick={() => { setMode('login'); setError(''); }}>Đăng nhập</button>
      {!admin && <button type="button" aria-pressed={registering} onClick={() => { setMode('register'); setError(''); }}>Đăng ký</button>}
    </div>}
    <h1>{admin ? 'Đăng nhập quản trị' : registering ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
    {admin && <p>Dùng tài khoản TiệmDigital đã được cấp quyền quản trị.</p>}
    <form aria-label={registering ? 'Đăng ký tài khoản' : 'Đăng nhập bằng mật khẩu'} onSubmit={async (event) => {
      event.preventDefault(); setError('');
      if (registering && password !== confirmation) { setError('Mật khẩu nhập lại chưa khớp.'); return; }
      setBusy(true);
      try {
        if (registering) await api('/api/auth/register', { body: { username: identifier.trim(), password, ...(email.trim() ? { email: email.trim() } : {}) } });
        else {
          const value = identifier.trim();
          await api(value.includes('@') ? '/api/auth/sign-in/email' : '/api/auth/sign-in/username', { body: value.includes('@') ? { email: value.toLowerCase(), password } : { username: value, password } });
        }
        onLogin();
      } catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        <label>{registering ? 'Username' : 'Username hoặc email'}<input required name="username" autoComplete="username" minLength={registering ? 3 : undefined} maxLength={registering ? 30 : 254} pattern={registering ? '[A-Za-z0-9_.]+' : undefined} title={registering ? '3–30 ký tự: chữ, số, dấu chấm hoặc gạch dưới.' : undefined} value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
        {registering && <label>Email (không bắt buộc)<input type="email" name="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        <label>Mật khẩu<input type="password" name="password" required minLength={8} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {registering && <label>Nhập lại mật khẩu<input type="password" name="confirmPassword" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
        {error && <p role="alert" className="notice error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Đang xử lý…' : registering ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
      </fieldset>
    </form>
    <TelegramLogin onLogin={onLogin} />
    {!registering && <button type="button" className="quiet" onClick={() => setMode('email')}>Dùng mã email</button>}
  </section>;
}
