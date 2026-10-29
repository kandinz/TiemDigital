export function formatVND(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Number.isFinite(amount) ? amount : 0)} ₫`;
}

export function extractSpecs(name: string): { tokens?: string; duration?: string } {
  const tokens = name.match(/(\d+\s*(?:tỷ|m|k|tr|triệu|billion|million)?\s*tokens?)/i)?.[1];
  const duration = name.match(/(\d+\s*(?:days?|ngày|tháng|months?|thg))\b/i)?.[1];
  return { tokens: tokens?.toUpperCase(), duration };
}
