import { useState } from 'react';
import { api, type Customer } from '../services/platform';

export function ProfileForm({ actor, onSaved }: { actor: Customer; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(actor.name);
  const [username, setUsername] = useState(actor.username || '');
  const [email, setEmail] = useState(actor.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hasPassword = actor.hasPassword !== false;

  async function save(task: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await task(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="stack">
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <section className="panel">
      <h2>Thông tin tài khoản</h2>
      <form aria-label="Cập nhật hồ sơ" onSubmit={(event) => {
        event.preventDefault();
        void save(async () => {
          await api('/api/auth/profile', { body: { name: name.trim(), username: username.trim(), email: email.trim() } });
          await onSaved();
          setUsername(username.trim().toLowerCase()); setEmail(email.trim().toLowerCase());
          setMessage('Đã cập nhật hồ sơ.');
        });
      }}>
        <fieldset disabled={busy}>
          <label>Tên hiển thị<input name="name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" title="3–30 ký tự: chữ, số, dấu chấm hoặc gạch dưới." value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label>Email (không bắt buộc)<input name="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button disabled={busy}>{busy ? 'Đang xử lý…' : 'Cập nhật hồ sơ'}</button>
        </fieldset>
      </form>
    </section>
    <section className="panel">
      <h2>{hasPassword ? 'Đổi mật khẩu' : 'Tạo mật khẩu'}</h2>
      {!hasPassword && <p className="muted">Thêm mật khẩu để đăng nhập bằng username hoặc email của bạn.</p>}
      <form aria-label={hasPassword ? 'Đổi mật khẩu' : 'Tạo mật khẩu'} onSubmit={(event) => {
        event.preventDefault();
        if (newPassword !== confirmation) { setError('Mật khẩu nhập lại chưa khớp.'); setMessage(''); return; }
        void save(async () => {
          await api(hasPassword ? '/api/auth/change-password' : '/api/auth/password/create', { body: hasPassword ? { currentPassword, newPassword, revokeOtherSessions: true } : { newPassword } });
          setCurrentPassword(''); setNewPassword(''); setConfirmation('');
          await onSaved(); setMessage(hasPassword ? 'Đã đổi mật khẩu.' : 'Đã tạo mật khẩu.');
        });
      }}>
        <fieldset disabled={busy}>
          {hasPassword && <label>Mật khẩu hiện tại<input type="password" name="currentPassword" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>}
          <label>Mật khẩu mới<input type="password" name="newPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
          <label>Nhập lại mật khẩu mới<input type="password" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          {!hasPassword && !actor.username && !actor.email && <p className="muted">Hãy lưu username trong hồ sơ trước khi tạo mật khẩu.</p>}
          <button disabled={busy || (!hasPassword && !actor.username && !actor.email)}>{busy ? 'Đang xử lý…' : hasPassword ? 'Đổi mật khẩu' : 'Tạo mật khẩu'}</button>
        </fieldset>
      </form>
    </section>
  </div>;
}
