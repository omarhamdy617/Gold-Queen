"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, hashPassword, logAudit } from "@/lib/auth";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
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

export async function getSettings() {
  const [s] = await db.select().from(schema.settings);
  return s;
}

export async function updateSettings(data: Partial<{ companyName: string; defaultVatRate: number; largeInvoiceAlert: number; adminWhatsapp: string; backupFrequency: string }>) {
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
}
