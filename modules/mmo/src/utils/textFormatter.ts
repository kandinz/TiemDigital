/**
 * Chuẩn hóa và định dạng văn bản mô tả sản phẩm MMO, tự động ngắt dòng các danh sách, mục gạch đầu dòng và tiêu đề con để hiển thị rõ ràng trên popup.
 */
export function formatProductDescription(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.trim();

  text = text.replace(/\\r\\n/g, '\n')
             .replace(/\\n/g, '\n')
             .replace(/\r\n/g, '\n')
             .replace(/\r/g, '\n')
             .replace(/<br\s*\/?>/gi, '\n')
             .replace(/<(?:p|div|li|h[1-6])[^>]*>/gi, '\n')
             .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
             .replace(/<[^>]+>/g, '');

  text = text.replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/&nbsp;/g, ' ');

  text = text.replace(/([^\n])\s*([=\-_~*]{3,})\s*([^\n])/g, '$1\n\n$2\n\n$3');

  text = text.replace(/([^\n])\s+(PLEASE READ [^!\n]+!)/gi, '$1\n\n$2');

  text = text.replace(/([^\n])\s*(?:[•·✦✔►▪▫❖→➔➜‼]|->|=>)\s*/gu, (match, p1) => {
    const symbol = match.replace(p1, '').trim();
    return `${p1}\n${symbol} `;
  });

  text = text.replace(/([.!?])\s+(\d+\.\s+[A-ZÀ-Ỹ])/gu, '$1\n$2');
  text = text.replace(/([^\n\d])\s+(\d+\.\s+[A-ZÀ-Ỹ])/gu, '$1\n$2');
  text = text.replace(/([^\n])\s+((?:Step|Bước)\s+\d+:)/gui, '$1\n\n$2');

  text = text.replace(/([.!?:)\]*])\s+-(?![-=])\s*/gu, '$1\n- ');
  text = text.replace(/([^\n\s])\s+-([A-ZÀ-Ỹ])/gu, '$1\n- $2');
  text = text.replace(/([^\n])\s+-(?![-=])\s+([A-ZÀ-Ỹ0-9])/gu, '$1\n- $2');

  const labelPatterns = [
    'Status', 'Supported Models', 'Performance', 'Mechanism',
    'Base URL', 'Model', 'User Manual', 'Video', 'Key verification page',
    'Exchange CDK for Key at', 'Notification channel', 'Refund warranty mode[^:\\n]*',
    'Warranty refund mode[^:\\n]*', 'Condition', 'Method', 'Format', 'FORMAT', 'Note', 'NOTE',
    'Auto-Login Tool[^:\\n]*', 'Auto-Login Tool 9router Json Codex',
    'KEY check page', 'Full model, and instructions', 'Get authentication code',
    '2FA site', '2FA SITE', 'New version password', 'Login key for[^:\\n]*',
    'Ordered goods', 'Web', 'Only login is warranted', 'URL ending[^:\\n]*',
    'Key Features', 'How to Use', 'How to [A-Z][a-zA-Z\\s]+', 'Usage period',
    'Information received', 'Example', 'Tips', 'Device Limit', 'Full Package',
    'Instant Delivery', '100% Genuine & Private', 'Get the code at', 'Get SMS for[^:\\n]*',
    'Warranty', 'Notes when using',
    'Định dạng', 'Dạng', 'Bảo hành', 'Chính sách bảo hành', 'Quy định bảo hành',
    'Lưu ý', 'Chú ý', 'Hướng dẫn', 'Hướng dẫn sử dụng', 'Cách dùng', 'Cách sử dụng',
    'Tài khoản', 'Mật khẩu', 'Điều kiện', 'Yêu cầu', 'Tính năng', 'Chức năng',
    'Hỗ trợ', 'Liên hệ', 'Ghi chú', 'Đặc điểm'
  ];

  const labelRegex = new RegExp(`([^\\n\\-(])\\s+(${labelPatterns.join('|')}):`, 'gui');
  text = text.replace(labelRegex, '$1\n$2:');

  text = text.replace(/([^\n])\s+(\*Supports [^*]+\*)/gu, '$1\n$2');

  if (/^-[A-ZÀ-Ỹ0-9]/u.test(text)) {
    text = '- ' + text.slice(1);
  }

  text = text.replace(/\n-\s*\n/gu, '\n- ');

  const lines = text.split('\n').map(l => l.trim()).filter((l, idx, arr) => {
    if (!l && idx > 0 && !arr[idx - 1]) return false;
    return true;
  });

  return lines.join('\n').trim();
}
