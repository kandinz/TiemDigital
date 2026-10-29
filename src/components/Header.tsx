import { useEffect, useState } from 'react';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { api, amountLabel, type Customer } from '../services/platform';

interface AccountInfo { name: string; email: string; balance: number | null }
interface HeaderProps { account?: AccountInfo | null; refreshKey?: number }

export function Header({ account, refreshKey = 0 }: HeaderProps) {
  const [loadedAccount, setLoadedAccount] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const user = account === undefined ? loadedAccount : account;

  useEffect(() => {
    if (account !== undefined) return;
    let stopped = false;
    api<Customer>('/api/me').then(async (customer) => {
      let balance: number | null = null;
      try { balance = (await api<{ balance: number }>('/api/me/wallet')).balance; } catch { /* Keep the account link available when the balance cannot be loaded. */ }
      if (!stopped) setLoadedAccount({ ...customer, balance });
    }).catch(() => { if (!stopped) setLoadedAccount(null); });
    return () => { stopped = true; };
  }, [account, refreshKey]);

  async function signOut() {
    setBusy(true);
    setError('');
    try { await api('/api/auth/sign-out', { body: {} }); window.location.assign('/'); }
    catch { setError('Chưa đăng xuất được. Vui lòng thử lại.'); setBusy(false); }
  }

  return <header className="shop-header">
    <div className="shop-container shop-header-inner">
      <a href="/" className="shop-wordmark" aria-label="Tiệm Digital, trang sản phẩm">Tiệm<span>Digital</span></a>
      <div className="shop-account">
        {user ? <details className="profile-menu" onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false; }}>
          <summary aria-label="Menu tài khoản">
            <span className="profile-avatar"><UserRound size={18} /></span>
            <span className="profile-info"><span className="profile-name">{user.name || user.email.split('@')[0]}</span><span className="profile-balance" aria-label="Số dư khả dụng">{user.balance === null ? 'Chưa tải được số dư' : amountLabel(user.balance)}</span></span>
            <ChevronDown size={15} />
          </summary>
          <div className="profile-dropdown" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) event.currentTarget.closest('details')?.removeAttribute('open'); }}>
            <a href="/account">Đơn hàng của tôi</a>
            <a href="/account#security">Hồ sơ & bảo mật</a>
            <a href="/account#wallet">Nạp tiền & giao dịch</a>
            <button disabled={busy} onClick={() => void signOut()}><LogOut size={15} />{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
            {error && <p role="alert">{error}</p>}
          </div>
        </details> : <a className="shop-button account-login" href="/account"><UserRound size={17} /><span>Đăng nhập</span></a>}
      </div>
    </div>
  </header>;
}
