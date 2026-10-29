import { Headphones } from 'lucide-react';

export function SupportButton() {
  return <a className="support-button" href="https://t.me/kandinz" target="_blank" rel="noopener noreferrer" aria-label="Hỗ trợ qua Telegram @kandinz"><Headphones size={20} aria-hidden="true" /><span>Hỗ trợ</span></a>;
}
