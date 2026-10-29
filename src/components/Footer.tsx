import { Headphones } from 'lucide-react';

const year = new Date().getFullYear();

export function Footer() {
  return <><footer className="shop-footer shop-container">
    <span>© {year} Tiệm Digital</span>
  </footer>
    <a className="support-button" href="https://t.me/kandinz" target="_blank" rel="noopener noreferrer" aria-label="Hỗ trợ qua Telegram @kandinz"><Headphones size={20} aria-hidden="true" /><span>Hỗ trợ</span></a>
  </>;
}
