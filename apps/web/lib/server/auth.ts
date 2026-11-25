/**
 * Demo logins. Each person is a fictional employee; signing in sets a signed cookie (HMAC-SHA256), so a browser
 * cannot pretend to be someone else by editing it. The account holder signs in with a hold reference and the last
 * four digits of their phone instead.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USERS, type Role, type User } from "@/lib/users";

const SECRET = process.env.SESSION_SECRET ?? "scalpel-demo-secret-change-me";
const sign = (v: string) => createHmac("sha256", SECRET).update(v).digest("base64url");
const pack = (v: string) => `${v}.${sign(v)}`;
function unpack(c: string | undefined): string | null {
  if (!c) return null;
  const i = c.lastIndexOf(".");
  if (i < 1) return null;
  const v = c.slice(0, i), sig = Buffer.from(c.slice(i + 1)), want = Buffer.from(sign(v));
  return sig.length === want.length && timingSafeEqual(sig, want) ? v : null;
}

const STAFF = "scalpel_staff";
const HOLDER = "scalpel_holder";
const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 12 };

export async function currentUser(): Promise<User | null> {
  const id = unpack((await cookies()).get(STAFF)?.value);
  return USERS.find((u) => u.id === id) ?? null;
}

export async function requireUser(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (roles.length && !roles.includes(u.role)) redirect(`/login?denied=${encodeURIComponent(roles.join(","))}`);
  return u;
}

export async function signIn(id: string) { (await cookies()).set(STAFF, pack(id), opts); }
export async function signOut() { const c = await cookies(); c.delete(STAFF); c.delete(HOLDER); }

export async function holderRef(): Promise<string | null> { return unpack((await cookies()).get(HOLDER)?.value); }
export async function signInHolder(ref: string) { (await cookies()).set(HOLDER, pack(ref), { ...opts, maxAge: 60 * 30 }); }
