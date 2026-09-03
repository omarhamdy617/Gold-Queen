import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

const COOKIE_NAME = "gc_session";
const secretKey = () => new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "dev_secret_change_me");

export type SessionPayload = {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

// permission resolution: ADMIN role bypasses everything.
// Otherwise: role-level permissions, overridden by per-user permission rows (allow=false blocks, allow=true grants extra)
export async function getEffectivePermissions(userId: string, roleId: string, roleName: string): Promise<Set<string>> {
  if (roleName === "ADMIN") {
    const { ALL_PERMISSION_KEYS } = await import("@/lib/permissions");
    return new Set(ALL_PERMISSION_KEYS);
  }
  const rolePerms = await db.select().from(schema.permissions).where(eq(schema.permissions.roleId, roleId));
  const userPerms = await db.select().from(schema.permissions).where(eq(schema.permissions.userId, userId));
  const set = new Set<string>();
  for (const p of rolePerms) if (p.allow) set.add(p.key);
  for (const p of userPerms) {
    if (p.allow) set.add(p.key);
    else set.delete(p.key);
  }
  return set;
}

export async function can(key: string): Promise<boolean> {
  const s = await getSession();
  if (!s) return false;
  const perms = await getEffectivePermissions(s.userId, s.roleId, s.roleName);
  return perms.has(key);
}

export async function requirePermission(key: string) {
  const ok = await can(key);
  if (!ok) throw new Error("FORBIDDEN: " + key);
}

export async function logAudit(params: {
  action: string;
  entityType: string;
  entityId?: string;
  before?: any;
  after?: any;
}) {
  const s = await getSession();
  await db.insert(schema.auditLogs).values({
    userId: s?.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before: params.before ?? null,
    after: params.after ?? null,
  });
}

export function genCode(prefix: string) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  // 8 hex chars from crypto-strength randomness (~4.29 billion combinations) makes a
  // same-day collision on the unique `code` column effectively impossible, unlike the
  // old 4-digit Math.random() suffix (only 9000 values/day) which could collide and
  // crash the save with a raw, unhandled database error (shown to the user as the
  // generic "Minified React error #441").
  const rand = randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}
