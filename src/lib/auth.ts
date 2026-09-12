import "server-only";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

const COOKIE_NAME = "gc_session";

// مفتاح تشفير الجلسات لازم يتسجل كمتغير بيئة NEXTAUTH_SECRET (في إعدادات Vercel). قبل كده كان فيه
// قيمة افتراضية مكتوبة في الكود نفسها لو المتغير مش موجود - وده معناه إن أي حد شايف الكود يقدر يزوّر
// تسجيل دخول أدمن كامل لو الإعداد ده اتنسى بالغلط. دلوقتي النظام يرفض يشتغل تمامًا من غيره بدل ما
// يشتغل بأمان وهمي.
function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      "إعداد الأمان NEXTAUTH_SECRET مش متسجل صح على السيرفر - محتاج تتأكد إنه متضاف في Environment Variables على Vercel بقيمة عشوائية طويلة، وبعدين تعمل Redeploy."
    );
  }
  return new TextEncoder().encode(secret);
}

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
//
// مهم: بنجيب دور المستخدم وحالة نشاطه *من قاعدة البيانات فريش* هنا بدل ما نثق في القيم المخزّنة
// جوه الجلسة (JWT) نفسها. الجلسة ممكن تفضل شغالة لحد 30 يوم، فلو حد نزّل موظف من أدمن لدور تاني،
// أو أوقف حسابه خالص، لازم الحماية تتطبق من أول طلب جديد ليه - مش تفضل تثق في بيانات الدخول القديمة.
//
// ملحوظة أداء: الدالة دي كانت بتتنفذ من الصفر (استعلام أو تلاتة لقاعدة البيانات) في كل مرة تتنادى،
// حتى لو اتنادت أكتر من مرة في نفس التحميل لنفس الصفحة - زي صفحة المشتريات اللي بتحمّل 5 أقسام
// مختلفة مع بعض (Promise.all)، كل قسم منهم بيتحقق من صلاحياتك بشكل منفصل، يعني 5 رحلات مكررة
// لقاعدة البيانات بس عشان نتأكد من نفس الصلاحيات لنفس المستخدم. cache() من React بتخزن نتيجة
// أول استدعاء لنفس المستخدم مؤقتًا لحد ما الطلب الحالي يخلص، فباقي الاستدعاءات في نفس الطلب
// بتاخد النتيجة الجاهزة من غير ما تعمل استعلام تاني - ده بيقلل عدد رحلات قاعدة البيانات في تحميل
// أي صفحة فيها أكتر من قسم، وده جزء من سبب بطء/تهنيج النظام وقت الضغط.
export const getEffectivePermissions = cache(async (userId: string): Promise<Set<string>> => {
  const [user] = await db
    .select({ roleId: schema.users.roleId, roleName: schema.roles.name, active: schema.users.active })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, userId));
  if (!user || !user.active) return new Set<string>();

  if (user.roleName === "ADMIN") {
    const { ALL_PERMISSION_KEYS } = await import("@/lib/permissions");
    return new Set(ALL_PERMISSION_KEYS);
  }
  const rolePerms = await db.select().from(schema.permissions).where(eq(schema.permissions.roleId, user.roleId));
  const userPerms = await db.select().from(schema.permissions).where(eq(schema.permissions.userId, userId));
  const set = new Set<string>();
  for (const p of rolePerms) if (p.allow) set.add(p.key);
  for (const p of userPerms) {
    if (p.allow) set.add(p.key);
    else set.delete(p.key);
  }
  return set;
});

// نفس فكرة الكاش فوق - بتتنادى غالبًا في نفس الطلب اللي بينادي getEffectivePermissions (زي عمليات
// البيع/الشراء اللي بتتحقق من الصلاحية العادية وكمان بتتحقق لو المستخدم أدمن كامل عشان تسمح بتجاوز
// أقل سعر بيع)، فتخزينها مؤقتًا بنفس الطريقة بيوفر رحلة تانية لقاعدة البيانات.
const getCallerRoleName = cache(async (userId: string): Promise<string | undefined> => {
  const [actingUser] = await db
    .select({ roleName: schema.roles.name })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, userId));
  return actingUser?.roleName;
});

export async function can(key: string): Promise<boolean> {
  const s = await getSession();
  if (!s) return false;
  const perms = await getEffectivePermissions(s.userId);
  return perms.has(key);
}

// بيسمح للعملية تكمل لو المستخدم عنده أي صلاحية من اللي في القائمة (مش لازم كلهم) - مفيدة للشاشات
// اللي فيها صلاحية "أساسية" وصلاحية "إضافية" مبنية عليها (زي كشف حساب العميل اللي محتاج فتح شاشة
// العميل نفسها الأول)
export async function canAny(keys: string[]): Promise<boolean> {
  const s = await getSession();
  if (!s) return false;
  const perms = await getEffectivePermissions(s.userId);
  return keys.some((k) => perms.has(k));
}

export async function requirePermission(key: string) {
  const ok = await can(key);
  if (!ok) throw new Error("FORBIDDEN: " + key);
}

export async function requireAnyPermission(keys: string[]) {
  const ok = await canAny(keys);
  if (!ok) throw new Error("FORBIDDEN: " + keys.join(" | "));
}

// بيتأكد إن اللي بينفذ العملية أدمن فعلي (مش بس عنده صلاحية "users.manage") - لازم لأي عملية ممكن
// تستخدم عشان تصعيد صلاحيات (زي منح/سحب صلاحية لدور أو مستخدم): لو اكتفينا بالتحقق من صلاحية
// "users.manage" بس، أي حد عنده الصلاحية دي (من غير ما يكون أدمن كامل) كان يقدر يمنح نفسه أو
// حد تاني أي صلاحية تانية في النظام أوتوماتيك - وده بيلغي فايدة قاعدة "بس الأدمن يقدر يدي دور أدمن"
// اللي موجودة في createUser/updateUser، لأنه مش لازم يوصلك أصلًا لدور أدمن كامل عشان توصل لكل صلاحياته.
// نسخة بترجع true/false بدل ما ترمي استثناء - للحالات اللي محتاجة تتصرف مختلف لو أدمن (زي تجاوز
// أقل سعر بيع) من غير ما توقف العملية كلها لو مش أدمن
export async function isCallerAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const roleName = await getCallerRoleName(session.userId);
  return roleName === "ADMIN";
}

export async function requireAdminRole() {
  const session = await requireSession();
  const roleName = await getCallerRoleName(session.userId);
  if (roleName !== "ADMIN") {
    throw new Error("العملية دي محصورة على الأدمن الكامل بس - صلاحية \"إدارة المستخدمين\" وحدها مش كفاية عشان تمنع تصعيد صلاحيات");
  }
  return session;
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

// -------------------- حماية تسجيل الدخول من تخمين كلمة السر (brute-force) --------------------
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function checkLoginLock(userId: string): Promise<{ locked: boolean; minutesLeft?: number }> {
  const [u] = await db.select({ lockedUntil: schema.users.lockedUntil }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    const minutesLeft = Math.ceil((new Date(u.lockedUntil).getTime() - Date.now()) / 60000);
    return { locked: true, minutesLeft };
  }
  return { locked: false };
}

export async function registerFailedLogin(userId: string) {
  const [u] = await db.select({ failedLoginAttempts: schema.users.failedLoginAttempts }).from(schema.users).where(eq(schema.users.id, userId));
  const attempts = (u?.failedLoginAttempts || 0) + 1;
  const payload: any = { failedLoginAttempts: attempts };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    payload.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    payload.failedLoginAttempts = 0;
  }
  await db.update(schema.users).set(payload).where(eq(schema.users.id, userId));
}

export async function clearFailedLogins(userId: string) {
  await db.update(schema.users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, userId));
}

// نفس منطق القفل المؤقت بالظبط لكن لاسم مستخدم مش موجود في الجدول أصلًا - عشان رسالة/سلوك القفل
// يبقى متطابق تمامًا سواء الاسم موجود أو لأ (شوف تعليق جدول login_lockouts في schema.ts)
export async function checkUnknownUsernameLock(usernameKey: string): Promise<{ locked: boolean; minutesLeft?: number }> {
  const [row] = await db.select().from(schema.loginLockouts).where(eq(schema.loginLockouts.usernameKey, usernameKey));
  if (row?.lockedUntil && new Date(row.lockedUntil) > new Date()) {
    const minutesLeft = Math.ceil((new Date(row.lockedUntil).getTime() - Date.now()) / 60000);
    return { locked: true, minutesLeft };
  }
  return { locked: false };
}

export async function registerUnknownUsernameFailedLogin(usernameKey: string) {
  const [row] = await db.select().from(schema.loginLockouts).where(eq(schema.loginLockouts.usernameKey, usernameKey));
  const attempts = (row?.failedAttempts || 0) + 1;
  const payload: any = { failedAttempts: attempts, updatedAt: new Date() };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    payload.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    payload.failedAttempts = 0;
  }
  if (row) {
    await db.update(schema.loginLockouts).set(payload).where(eq(schema.loginLockouts.id, row.id));
  } else {
    await db.insert(schema.loginLockouts).values({ usernameKey, ...payload });
  }
}
