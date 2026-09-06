"use server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { requirePermission, requireSession, requireAdminRole, hashPassword, logAudit } from "@/lib/auth";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

const MIN_PASSWORD_LENGTH = 6;

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
  if (!data.password || data.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} حروف/أرقام على الأقل`);
  }
  const [targetRole] = await db.select().from(schema.roles).where(eq(schema.roles.id, data.roleId));
  if (targetRole?.name === "ADMIN") {
    const session = await requireSession();
    const [actingUser] = await db
      .select({ roleName: schema.roles.name })
      .from(schema.users)
      .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
      .where(eq(schema.users.id, session.userId));
    if (actingUser?.roleName !== "ADMIN") throw new Error("بس الأدمن يقدر يضيف مستخدم بدور أدمن");
  }
  const passwordHash = await hashPassword(data.password);
  const [u] = await db.insert(schema.users).values({ username: data.username, fullName: data.fullName, passwordHash, roleId: data.roleId }).returning();
  await logAudit({ action: "CREATE", entityType: "User", entityId: u.id, after: { username: u.username } });
  revalidatePath("/settings/users");
  return u;
}

export async function updateUserPassword(userId: string, password: string) {
  await requirePermission("users.manage");
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} حروف/أرقام على الأقل`);
  }
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

  // منع ترقية الذات (أو ترقية أي حد) لدور "أدمن" إلا لو اللي بيعمل التعديل أدمن بالفعل - قبل كده أي
  // حد عنده صلاحية "إدارة المستخدمين" بس (مش أدمن كامل) كان يقدر يغيّر دوره هو نفسه لأدمن من غير موافقة.
  if (data.roleId !== undefined) {
    const [targetRole] = await db.select().from(schema.roles).where(eq(schema.roles.id, data.roleId));
    if (targetRole?.name === "ADMIN") {
      const session = await requireSession();
      const [actingUser] = await db
        .select({ roleName: schema.roles.name })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
        .where(eq(schema.users.id, session.userId));
      if (actingUser?.roleName !== "ADMIN") throw new Error("بس الأدمن يقدر يدي حد صلاحية أدمن كامل");
    }
  }

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

// بيتأكد إن العملية مش هتسيب النظام من غير أي أدمن نشط شغال، ومش هتوقف/تمسح أدمن لحساب نفسه
async function assertNotLastActiveAdmin(userId: string, session: { userId: string }) {
  if (userId === session.userId) throw new Error("متقدرش توقف/تمسح حسابك إنت شخصيًا وإنت داخل بيه");
  const [target] = await db
    .select({ roleName: schema.roles.name })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, userId));
  if (target?.roleName !== "ADMIN") return;
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(and(eq(schema.roles.name, "ADMIN"), eq(schema.users.active, true)));
  if (admins.filter((a) => a.id !== userId).length === 0) {
    throw new Error("ده آخر حساب أدمن نشط في النظام - متقدرش توقفه/تمسحه، لازم يكون فيه أدمن تاني نشط الأول");
  }
}

export async function toggleUserActive(userId: string, active: boolean) {
  try {
    await requirePermission("users.manage");
    const session = await requireSession();
    if (!active) await assertNotLastActiveAdmin(userId, session);
    await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
    revalidatePath("/settings/users");
  } catch (e) {
    return toActionError(e, "تعذر تغيير حالة المستخدم");
  }
}

export async function deleteUser(userId: string) {
  try {
    await requirePermission("users.manage");
    const session = await requireSession();
    await assertNotLastActiveAdmin(userId, session);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user) throw new Error("المستخدم غير موجود");
    try {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    } catch (e: any) {
      // المستخدم ده مرتبط بسجلات فعلية (فواتير/عمليات سابقة سجلها) - المفروض توقفه (خانة "نشط") بدل ما تمسحه خالص
      if (String(e?.message || "").toLowerCase().includes("foreign key") || String(e?.code) === "23503") {
        throw new Error(`متقدرش تمسح "${user.fullName}" لأنه مسجل عمليات فعلية قبل كده (فواتير/مشتريات/إلخ) مرتبطة بيه - استخدم زرار "إيقاف" بدل الحذف عشان تمنعه يدخل من غير ما تفقد سجل العمليات القديمة.`);
      }
      throw e;
    }
    await logAudit({ action: "DELETE", entityType: "User", entityId: userId, before: { username: user.username } });
    revalidatePath("/settings/users");
  } catch (e) {
    return toActionError(e, "تعذر حذف المستخدم");
  }
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
  try {
    return await setRolePermissionInner(roleId, key, allow);
  } catch (e) {
    return toActionError(e, "تعذر حفظ الصلاحية");
  }
}

async function setRolePermissionInner(roleId: string, key: string, allow: boolean) {
  // لازم أدمن كامل، مش بس صلاحية "إدارة المستخدمين" - وإلا أي حد عنده الصلاحية دي (من غير ما يكون
  // أدمن) كان يقدر يمنح نفسه أو أي دور تاني أي صلاحية تانية في النظام أوتوماتيك (تصعيد صلاحيات)،
  // وده بيلغي فايدة قاعدة "بس الأدمن يقدر يدي دور أدمن كامل" في createUser/updateUser تمامًا -
  // مش لازم توصل لدور أدمن أصلًا عشان توصل لكل صلاحياته لو قدرت تمنحها لنفسك من هنا.
  await requireAdminRole();
  const before = await db.select().from(schema.permissions).where(eq(schema.permissions.roleId, roleId));
  const row = before.find((r) => r.key === key);
  if (row) {
    await db.update(schema.permissions).set({ allow }).where(eq(schema.permissions.id, row.id));
  } else {
    await db.insert(schema.permissions).values({ roleId, key, allow });
  }
  await logAudit({ action: "UPDATE", entityType: "RolePermission", entityId: roleId, before: { key, allow: row?.allow }, after: { key, allow } });
  revalidatePath("/settings/users");
}

export async function setUserPermissionOverride(userId: string, key: string, allow: boolean | null) {
  try {
    return await setUserPermissionOverrideInner(userId, key, allow);
  } catch (e) {
    return toActionError(e, "تعذر حفظ الصلاحية");
  }
}

async function setUserPermissionOverrideInner(userId: string, key: string, allow: boolean | null) {
  // نفس سبب setRolePermission بالظبط: لازم أدمن كامل عشان يمنع تصعيد صلاحيات ذاتي أو لمستخدم تاني
  await requireAdminRole();
  const before = await db.select().from(schema.permissions).where(eq(schema.permissions.userId, userId));
  const row = before.find((r) => r.key === key);
  if (allow === null) {
    if (row) await db.delete(schema.permissions).where(eq(schema.permissions.id, row.id));
  } else if (row) {
    await db.update(schema.permissions).set({ allow }).where(eq(schema.permissions.id, row.id));
  } else {
    await db.insert(schema.permissions).values({ userId, key, allow });
  }
  await logAudit({ action: "UPDATE", entityType: "UserPermissionOverride", entityId: userId, before: { key, allow: row?.allow ?? null }, after: { key, allow } });
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
  // كانت من غير أي تحقق صلاحية خالص - ولا حتى requireSession. من غير middleware.ts كانت هتبقى
  // نقطة مفتوحة تمامًا لأي حد؛ حتى مع الحماية الموحدة في middleware.ts، أي مستخدم عنده جلسة (بغض
  // النظر عن دوره وصلاحياته) كان يقدر يجيب إعدادات الشركة كاملة (رقم واتساب الأدمن، حدود التنبيهات...)
  await requireSession();
  const [s] = await db.select().from(schema.settings);
  return s;
}

export async function updateSettings(data: Partial<{ companyName: string; companyAddress: string; companyPhone: string; companyPhone2: string; defaultVatRate: number; largeInvoiceAlert: number; adminWhatsapp: string; backupFrequency: string; returnReasons: string }>) {
  try {
    return await updateSettingsInner(data);
  } catch (e) {
    return toActionError(e, "تعذر حفظ الإعدادات");
  }
}

async function updateSettingsInner(data: Parameters<typeof updateSettings>[0]) {
  await requirePermission("settings.manage");
  // قبل كده لو القيمة الجاية من الشاشة مش رقم فعلي (NaN - مثلًا خانة فاضية اتبعتت كرقم بالغلط)،
  // (NaN).toFixed(2) بيرجع النص "NaN" حرفيًا، وده كان بيتخزن زي ما هو في عمود رقمي في قاعدة
  // البيانات (Postgres numeric بيقبل النص "NaN" كقيمة خاصة!) فيبوّظ كل حساب بعد كده بيستخدم القيمة دي
  if (data.defaultVatRate !== undefined && !Number.isFinite(data.defaultVatRate)) {
    throw new Error("نسبة الضريبة المدخلة غير صحيحة");
  }
  if (data.largeInvoiceAlert !== undefined && !Number.isFinite(data.largeInvoiceAlert)) {
    throw new Error("حد تنبيه الفاتورة الكبيرة المدخل غير صحيح");
  }
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
