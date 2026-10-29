import { betterAuth } from "better-auth";
import { emailOTP, username } from "better-auth/plugins";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Actor, Admin, Env } from "./types";
import { HttpError, readBody } from "./http";
import { z } from 'zod';
import { telegramAuth } from './telegram-auth';
import { profileAuth } from './profile-auth';
import { APIError } from 'better-auth/api';

export const publicEmail = (email: string) => email.endsWith('@users.invalid') ? '' : email;

export async function register(request: Request, env: Env) {
  const input = await readBody(request, z.object({
    username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
    password: z.string().min(8).max(128),
    email: z.union([z.email(), z.literal('')]).optional(),
  }));
  const email = input.email?.trim().toLowerCase();
  if (email?.endsWith('@users.invalid')) throw new HttpError(400, 'Địa chỉ email không hợp lệ.');
  try { return await auth(env).api.signUpEmail({
    body: { name: input.username, username: input.username, password: input.password, email: email || `${crypto.randomUUID()}@users.invalid` },
    headers: request.headers, asResponse: true,
  }); } catch (error) {
    if (error instanceof APIError) throw new HttpError(error.statusCode, error.body?.message || 'Không đăng ký được tài khoản.');
    throw error;
  }
}

export function auth(env: Env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new HttpError(503, "Chưa cấu hình secret đăng nhập an toàn");
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, requireEmailVerification: false },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 20 },
    advanced: {
      useSecureCookies: env.ENVIRONMENT !== "local",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: { generateId: () => crypto.randomUUID() },
    },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 30 }),
      telegramAuth(env),
      profileAuth(),
      emailOTP({
        storeOTP: "hashed",
        allowedAttempts: 3,
        expiresIn: 300,
        async sendVerificationOTP({ email, otp }) {
          if (!env.EMAIL || !env.EMAIL_FROM)
            throw new HttpError(503, "Chưa cấu hình email đăng nhập");
          await env.EMAIL.send({
            from: env.EMAIL_FROM,
            to: email,
            subject: "Mã đăng nhập Tiệm Digital",
            text: `Mã đăng nhập của bạn: ${otp}. Hiệu lực 5 phút. Không chia sẻ mã này.`,
          });
        },
      }),
    ],
  });
}
export async function customer(request: Request, env: Env): Promise<Actor> {
  const session = await auth(env).api.getSession({ headers: request.headers });
  if (!session?.user)
    throw new HttpError(401, "Vui lòng đăng nhập");
  const user = session.user;
  await env.DB.prepare("INSERT OR IGNORE INTO customers(id) VALUES(?)")
    .bind(user.id)
    .run();
  const row = await env.DB.prepare("SELECT disabled FROM customers WHERE id=?")
    .bind(user.id)
    .first<{ disabled: number }>();
  if (row?.disabled) throw new HttpError(403, "Tài khoản đã bị khóa");
  return { id: user.id, email: publicEmail(user.email), name: user.name, username: user.username ?? null };
}
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function administrator(
  request: Request,
  env: Env,
): Promise<Admin> {
  if (
    new URL(request.url).origin !== env.ADMIN_ORIGIN ||
    !env.ACCESS_ISSUER ||
    !env.ACCESS_AUD
  )
    throw new HttpError(403, "Admin chưa được cấu hình Access");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Cần đăng nhập Cloudflare Access");
  try {
    const issuer = env.ACCESS_ISSUER.replace(/\/$/, "");
    if (!keysets.has(issuer))
      keysets.set(
        issuer,
        createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      );
    const { payload } = await jwtVerify(token, keysets.get(issuer)!, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
    });
    if (
      typeof payload.email !== "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.exp !== "number"
    )
      throw new Error("Invalid claims");
    const role = await env.DB.prepare(
      "SELECT email,role FROM admin_roles WHERE email=?",
    )
      .bind(payload.email.toLowerCase())
      .first<Admin>();
    if (!role) throw new HttpError(403, "Chưa được cấp quyền quản trị");
    return role;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Phiên Access không hợp lệ");
  }
}
export function requireRole(admin: Admin, roles: Admin["role"][]) {
  if (!roles.includes(admin.role)) throw new HttpError(403, "Không đủ quyền");
}
