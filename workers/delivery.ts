import type { Env } from "./types";
import { HttpError } from "./http";

async function encryptionKey(env: Env) {
  if (!env.DELIVERY_KEY)
    throw new HttpError(503, "Chưa cấu hình khóa mã hóa giao hàng");
  const bytes = Uint8Array.from(atob(env.DELIVERY_KEY), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new HttpError(503, "Khóa mã hóa không hợp lệ");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptDelivery(
  env: Env,
  orderId: string,
  value: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(orderId) },
    await encryptionKey(env),
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    v: 1,
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  });
}
export async function decryptDelivery(
  env: Env,
  orderId: string,
  stored: string,
) {
  const data = JSON.parse(stored) as { v: number; iv: string; data: string };
  if (data.v !== 1) throw new HttpError(503, "Phiên bản mã hóa không hỗ trợ");
  const bytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(atob(data.iv), (c) => c.charCodeAt(0)),
      additionalData: new TextEncoder().encode(orderId),
    },
    await encryptionKey(env),
    Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0)),
  );
  return new TextDecoder().decode(bytes);
}
