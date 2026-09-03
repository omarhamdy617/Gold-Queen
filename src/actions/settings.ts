"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, hashPassword, logAudit } from "@/lib/auth";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

export async function listRoles() {
  await requirePermission("users.manage");
  return db.select().from(schema.roles);
}

export async function listUsers() {
  await requirePermission("users.manage");
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      active: schema.users.active,
      roleId: schema.users.roleId,
      roleName: schema.roles.name,
    })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id));
  return rows;
}

export async function createUser(data: { username: string; fullName: string; password: string; roleId: string }) {
  await requirePermission("users.manage");
  const passwordHash = await hashPassword(data.password);
  const [u] = await db.insert(schema.users).values({ username: data.username, fullName: data.fullName, passwordHash, roleId: data.roleId }).returning();
  await logAudit({ action: "CREATE", entityType: "User", entityId: u.id, after: { username: u.username } });
  revalidatePath("/settings/users");
  return u;
}

export async function updateUserPassword(userId: string, password: string) {
  await requirePermission("users.manage");
  const passwordHash = await hashPassword(password);
  await db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, userId));
  await logAudit({ action: "UPDATE", entityType: "User", entityId: userId, after: { passwordChanged: true } });
}

export async function updateUser(userId: string, data: { username?: string; fullName?: string; roleId?: string }) {
  try {
    return await updateUserInner(userId, data);
  } catch (e) {
    return toActionError(e, "تعذر حفظ بيانات المستخدم");
  }
}

async function updateUserInner(userId: string, data: Parameters<typeof updateUser>[1]) {
  await requirePermission("users.manage");
  if (data.username !== undefined && !data.username.trim()) throw new Error("اسم المستخدم لازم يكون موجود");
  if (data.fullName !== undefined && !data.fullName.trim()) throw new Error("الاسم بالكامل لازم يكون موجود");
  const payload: any = { updatedAt: new Date() };
  if (data.username !== undefined) payload.username = data.username.trim();
  if (data.fullName !== undefined) payload.fullName = data.fullName.trim();
  if (data.roleId !== undefined) payload.roleId = data.roleId;
  try {
    const [u] = await db.update(schema.users).set(payload).where(eq(schema.users.id, userId)).returning();
    await logAudit({ action: "UPDATE", entityType: "User", entityId: userId, after: payload });
    revalidatePath("/settings/users");
    return u;
  } catch (e: any) {
    if (String(e?.message || "").includes("unique")) throw new Error("اسم المستخدم ده مستخدم بالفعل");
    throw e;
  }
}

export async function toggleUserActive(userId: string, active: boolean) {
  await requirePermission("users.manage");
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
  revalidatePath("/settings/users");
}

export async function deleteUser(userId: string) {
  await requirePermission("users.manage");
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await logAudit({ action: "DELETE", entityType: "User", entityId: userId });
  revalidatePath("/settings/users");
}

export async function getUserPermissionOverrides(userId: string) {
  await requirePermission("users.manage");
  return db.select().from(schema.permissions).where(eq(schema.permissions.userId, userId));
}

export async function getRolePermissions(roleId: string) {
  await requirePermission("users.manage");
  return db.select().from(schema.permissions).where(eq(schema.permissions.roleId, roleId));
}

export async function setRolePermission(roleId: string, key: string, allow: boolean) {
  await requirePermission("users.manage");
  const existing = await db.select().from(schema.permissions).where(eq(schema.permissions.roleId, roleId));
  const row = existing.find((r) => r.key === key);
  if (row) {
    await db.update(schema.permissions).set({ allow }).where(eq(schema.permissions.id, row.id));
  } else {
    await db.insert(schema.permissions).values({ roleId, key, allow });
  }
  revalidatePath("/settings/users");
}

export async function setUserPermissionOverride(userId: string, key: string, allow: boolean | null) {
  await requirePermission("users.manage");
  const existing = await db.select().from(schema.permissions).where(eq(schema.permissions.userId, userId));
  const row = existing.find((r) => r.key === key);
  if (allow === null) {
    if (row) await db.delete(schema.permissions).where(eq(schema.permissions.id, row.id));
  } else if (row) {
    await db.update(schema.permissions).set({ allow }).where(eq(schema.permissions.id, row.id));
  } else {
    await db.insert(schema.permissions).values({ userId, key, allow });
  }
  revalidatePath("/settings/users");
}

export async function createCustomRole(name: string) {
  await requirePermission("users.manage");
  const [role] = await db.insert(schema.roles).values({ name, builtIn: false }).returning();
  revalidatePath("/settings/users");
  return role;
}

export async function renameRole(roleId: string, name: string) {
  try {
    return await renameRoleInner(roleId, name);
  } catch (e) {
    return toActionError(e, "تعذر حفظ اسم الدور");
  }
}

async function renameRoleInner(roleId: string, name: string) {
  await requirePermission("users.manage");
  if (!name.trim()) throw new Error("لازم تكتب اسم للمسمى الوظيفي");
  const [role] = await db.update(schema.roles).set({ name: name.trim() }).where(eq(schema.roles.id, roleId)).returning();
  await logAudit({ action: "UPDATE", entityType: "Role", entityId: roleId, after: { name } });
  revalidatePath("/settings/users");
  return role;
}

export async function getSettings() {
  const [s] = await db.select().from(schema.settings);
  return s;
}

export async function updateSettings(data: Partial<{ companyName: string; companyAddress: string; companyPhone: string; companyPhone2: string; defaultVatRate: number; largeInvoiceAlert: number; adminWhatsapp: string; backupFrequency: string; returnReasons: string }>) {
  await requirePermission("settings.manage");
  const existing = await getSettings();
  const payload: any = { ...data, updatedAt: new Date() };
  if (data.defaultVatRate !== undefined) payload.defaultVatRate = data.defaultVatRate.toFixed(2);
  if (data.largeInvoiceAlert !== undefined) payload.largeInvoiceAlert = data.largeInvoiceAlert.toFixed(2);
  if (existing) {
    await db.update(schema.settings).set(payload).where(eq(schema.settings.id, 1));
  } else {
    await db.insert(schema.settings).values({ id: 1, ...payload });
  }
  revalidatePath("/settings");
  revalidatePath("/returns");
}

const DEFAULT_RETURN_REASONS = ["منتج تالف", "عيب مصنعي", "غير مطابق للمواصفات", "العميل غيّر رأيه", "وصل بالخطأ / كمية زيادة", "أخرى"];

export async function getReturnReasons() {
  const s = await getSettings();
  if (!s?.returnReasons) return DEFAULT_RETURN_REASONS;
  const list = s.returnReasons.split("\n").map((r) => r.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_RETURN_REASONS;
}
