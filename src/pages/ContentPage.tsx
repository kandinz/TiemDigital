import { useEffect, useState } from 'react';
import { api, type PageBlock } from '../services/platform';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import '../platform.css';

interface Page { title: string; description: string; blocks: PageBlock[] }

export function ContentPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const support = slug === 'lien-he';
  useEffect(() => {
    if (support) {
      document.title = 'Hỗ trợ | Tiệm Digital';
      return;
    }
    let stopped = false;
    document.title = 'Tiệm Digital';
    api<Page>(`/api/pages/${encodeURIComponent(slug)}`).then((value) => {
      if (stopped) return;
      setPage(value);
      document.title = `${value.title} | Tiệm Digital`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', value.description);
    }).catch(() => {
      if (!stopped) setError('Chưa tải được thông tin. Vui lòng thử lại.');
    }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [slug, retry, support]);

  return <div className="shop-shell">
    <Header />
    <div className="platform platform-shell account-shell"><main className="page-body">
      <h1>{support ? 'Hỗ trợ' : page?.title || 'Thông tin'}</h1>
      {support && <div className="support-options">
        <a href="/account#orders"><strong>Đơn hàng & nhận sản phẩm</strong><span>Xem trạng thái thanh toán và thông tin sản phẩm đã mua.</span></a>
        <a href="/account#wallet"><strong>Số dư & nạp tiền</strong><span>Kiểm tra số dư, mã QR nạp tiền và lịch sử giao dịch.</span></a>
      </div>}
      {support ? <section className="panel support-contact"><h2>Liên hệ qua Telegram</h2><p className="muted">Gửi mã đơn hàng và nội dung cần hỗ trợ cho @kandinz.</p><a className="primary" href="https://t.me/kandinz" target="_blank" rel="noopener noreferrer">Nhắn @kandinz</a></section>
        : loading ? <p role="status">Đang tải thông tin…</p> : error ? <div className="panel"><p role="status" className="muted">{error}</p><button onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1); }}>Thử lại</button></div> : page && <section className="panel support-contact">
        {page.description && <p className="muted">{page.description}</p>}
        {page.blocks.map((block, index) => block.type === 'text' ? <div key={index}>{block.heading && <h3>{block.heading}</h3>}<p>{block.text}</p></div>
          : block.type === 'image' ? <img key={index} src={block.url} alt={block.alt || ''} className="support-image" />
          : <p key={index}><a href={block.url} rel="noreferrer">{block.label} ↗</a></p>)}
      </section>}
    </main></div>
    <Footer />
  </div>;
}
