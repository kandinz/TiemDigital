export const DEFAULT_TIMEOUT_MS = 30000;

// Joins a vendor base URL and a path with exactly one slash, whatever the config contains.
export function providerUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// Raw vendor call with a uniform timeout; callers keep control of non-success responses.
export async function providerFetch(url: string, init: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new Error(`Timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function providerJson<T = any>(url: string, init: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  const res = await providerFetch(url, init, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const DEFAULT_IDR_RATE = 16000;

// VND & IDR are converted at the configured or standard rate; any USD-like currency is returned as-is.
export function toUsd(amount: number, currency: string, usdRate: number): number {
  const cur = currency.toUpperCase();
  if (cur === "VND") return Math.round((amount / usdRate) * 100) / 100;
  if (cur === "IDR") return Math.round((amount / DEFAULT_IDR_RATE) * 100) / 100;
  return amount;
}
