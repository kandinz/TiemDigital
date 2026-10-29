import { useEffect, useRef, useState } from 'react';
import { api } from '../services/platform';

interface Challenge { token: string; url: string; expiresAt: number }

export function TelegramLogin({ onLogin }: { onLogin: () => void }) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = useRef(onLogin);
  useEffect(() => { login.current = onLogin; }, [onLogin]);
  useEffect(() => {
    if (!challenge) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      if (Date.now() >= challenge!.expiresAt * 1000) {
        setError('Yêu cầu đã hết hạn. Vui lòng tạo lại.');
        setChallenge(null);
        return;
      }
      if (!document.hidden) {
        try {
          const result = await api<{ status: 'PENDING' | 'SIGNED_IN' }>('/api/auth/telegram/complete', { body: { token: challenge!.token } });
          if (stopped) return;
          if (result.status === 'SIGNED_IN') { setChallenge(null); login.current(); return; }
        } catch (e) {
          if (!stopped) { setError((e as Error).message); setChallenge(null); }
          return;
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 5000);
    }
    timer = setTimeout(() => void poll(), 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [challenge]);

  async function start() {
    setBusy(true); setError('');
    try { setChallenge(await api<Challenge>('/api/auth/telegram/start', { body: {} })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="telegram-login">
    {challenge ? <>
      <a className="primary" href={challenge.url} target="_blank" rel="noopener noreferrer">Mở bot để xác nhận đăng nhập</a>
      <p className="muted" role="status">Xác nhận trong bot rồi quay lại đây. Website sẽ tự đăng nhập bằng tài khoản Telegram của bạn.</p>
      <button type="button" className="quiet" onClick={() => setChallenge(null)}>Hủy yêu cầu</button>
    </> : <button type="button" disabled={busy} onClick={() => void start()}>{busy ? 'Đang tạo yêu cầu…' : 'Đăng nhập bằng Telegram'}</button>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </div>;
}
