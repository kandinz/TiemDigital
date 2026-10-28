import { z } from "zod";
import type { Env } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export const now = () => Math.floor(Date.now() / 1000);
export const id = () => crypto.randomUUID();
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const text = await limitedText(request, 32768);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON không hợp lệ");
  }
  const result = schema.safeParse(body);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  return result.data;
}
export async function limitedText(request: Request, max: number) {
  return new TextDecoder().decode(await limitedBytes(request, max));
}
export async function limitedBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max)
    throw new HttpError(413, "Dữ liệu quá lớn");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Dữ liệu quá lớn");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export function checkOrigin(request: Request, env: Env, admin = false) {
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !==
      (admin ? env.ADMIN_ORIGIN : env.APP_ORIGIN)
  ) {
    throw new HttpError(403, "Nguồn yêu cầu không hợp lệ");
  }
}
export async function audit(
  env: Env,
  actor: string,
  action: string,
  target: string,
  detail: unknown = {},
) {
  return env.DB.prepare(
    "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
  )
    .bind(id(), actor, action, target, JSON.stringify(detail))
    .run();
}
export async function rateLimit(
  env: Env,
  key: string,
  max: number,
  seconds = 60,
) {
  const bucket = `${key}:${Math.floor(now() / seconds)}`;
  const result = await env.DB.prepare(
    "INSERT INTO rateLimit(id,key,count,lastRequest) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(bucket, bucket, Date.now())
    .first<{ count: number }>();
  if (!result || result.count > max)
    throw new HttpError(429, "Quá nhiều yêu cầu. Vui lòng thử lại sau.");
}
