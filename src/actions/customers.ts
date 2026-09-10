"use server";
import { db, schema } from "@/db";
import { eq, or, ilike, and, gte, lte, desc } from "drizzle-orm";
import { requirePermission, requireSession, requireAnyPermission, logAudit, can, canAny } from "@/lib/auth";
import { postCashByPaymentMethod, updateCustomerBalance } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export async function listCustomers(search?: string, filters?: { type?: "RETAIL" | "TRADER"; owesOnly?: boolean }) {
  // "كشف حساب العميل" لوحدها كانت مش كفاية عشان توصل للعميل - محتاجة تلقائيًا "إدارة العملاء" كمان
  // عشان تقدر أصلًا تفتح قائمة/صفحة العميل. دلوقتي أي صلاحية من الاتنين كفاية للعرض (القراءة بس).
  await requireAnyPermission(["customers.manage", "customers.statement"]);
  const rows = await db
    .select()
    .from(schema.customers)
    .where(
      search ? or(ilike(schema.customers.name, `%${search}%`), ilike(schema.customers.phone, `%${search}%`)) : undefined
    )
    .orderBy(schema.customers.name);
  let result = rows;
  if (filters?.type) result = result.filter((c) => c.type === filters.type);
  if (filters?.owesOnly) result = result.filter((c) => Number(c.balance) > 0);
  return result;
}

export async function createCustomer(data: { name: string; phone?: string; type: "RETAIL" | "TRADER"; creditLimit?: number; notes?: string }) {
  try {
    return await createCustomerInner(data);
  } catch (e) {
    return toActionError(e, "تعذر إضافة العميل");
  }
}

async function createCustomerInner(data: Parameters<typeof createCustomer>[0]) {
  await requirePermission("customers.manage");
  if (!data.name?.trim()) throw new Error("اسم العميل مطلوب");
  const phone = data.phone ? normalizePhone(data.phone) : undefined;
  if (phone) {
    const [existing] = await db.select().from(schema.customers).where(eq(schema.customers.phone, phone));
    if (existing) throw new Error(`الرقم ده مسجل بالفعل لعميل اسمه "${existing.name}" - اختاره من قائمة البحث بدل ما تعمل عميل جديد`);
  }
  const [c] = await db
    .insert(schema.customers)
    .values({ ...data, phone, creditLimit: (data.creditLimit || 0).toFixed(2) })
    .returning();
  await logAudit({ action: "CREATE", entityType: "Customer", entityId: c.id, after: c });
  revalidatePath("/customers");
  return c;
}

export async function updateCustomer(id: string, data: Partial<{ name: string; phone: string; type: "RETAIL" | "TRADER"; creditLimit: number; notes: string; active: boolean }>) {
  try {
    return await updateCustomerInner(id, data);
  } catch (e) {
    return toActionError(e, "تعذر حفظ بيانات العميل");
  }
}

async function updateCustomerInner(id: string, data: Parameters<typeof updateCustomer>[1]) {
  await requirePermission("customers.manage");
  // بنبني الـ payload بأسماء الأعمدة المسموحة صراحةً واحد واحد - مش {...data} - عشان لو حد بعت طلب
  // مباشر لنقطة الـ Server Action دي (من غير المرور على TypeScript، اللي بيتفحص وقت البرمجة بس مش
  // وقت التشغيل) وحط عمود حساس زي balance (رصيد العميل - المفروض يتغيّر بس من خلال فواتير/تحصيل/
  // مرتجعات حقيقية عشان يفضل متوافق مع سجل الحركات الفعلي)، متتسجلش.
  const payload: any = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.type !== undefined) payload.type = data.type;
  if (data.notes !== undefined) payload.notes = data.notes;
  if (data.active !== undefined) payload.active = data.active;
  if (data.phone !== undefined) {
    const phone = normalizePhone(data.phone);
    if (phone) {
      const [existing] = await db.select().from(schema.customers).where(eq(schema.customers.phone, phone));
      if (existing && existing.id !== id) throw new Error(`الرقم ده مسجل بالفعل لعميل اسمه "${existing.name}"`);
    }
    payload.phone = phone;
  }
  if (data.creditLimit !== undefined) payload.creditLimit = data.creditLimit.toFixed(2);
  const [c] = await db.update(schema.customers).set(payload).where(eq(schema.customers.id, id)).returning();
  // لو العميل ده اتمسح (أو ID غلط) من الأصل، update بترجع صف فاضي من غير أي خطأ - كانت الشاشة
  // بتفهم النتيجة دي كـ"نجاح" وهمي (مفيش error) بينما فعليًا محصلش أي تعديل خالص
  if (!c) throw new Error("العميل ده مش موجود (يمكن اتمسح) - مقدرش أحفظ التعديل");
  await logAudit({ action: "UPDATE", entityType: "Customer", entityId: id, after: payload });
  revalidatePath("/customers");
  return c;
}

export async function getCustomer(id: string) {
  await requireAnyPermission(["customers.manage", "customers.statement"]);
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  if (!c) return c;
  const orders = await db
    .select({ id: schema.orders.id, code: schema.orders.code, status: schema.orders.status, createdAt: schema.orders.createdAt })
    .from(schema.orders)
    .where(eq(schema.orders.customerId, id))
    .orderBy(desc(schema.orders.createdAt));
  return { ...c, orders };
}

export async function recordCollection(data: { customerId: string; amount: number; paymentMethodId: string; note?: string }) {
  try {
    return await recordCollectionInner(data);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل التحصيل");
  }
}

async function recordCollectionInner(data: Parameters<typeof recordCollection>[0]) {
  await requirePermission("customers.manage");
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("مبلغ التحصيل لازم يكون رقم أكبر من صفر");
  }
  const session = await requireSession();
  await db.transaction(async (tx) => {
    await updateCustomerBalance(tx, data.customerId, -data.amount);
    await postCashByPaymentMethod(tx, data.paymentMethodId, "COLLECTION_IN", data.amount, {
      note: data.note || "تحصيل من عميل",
      refType: "Customer",
      refId: data.customerId,
      createdById: session.userId,
    });
    await tx.insert(schema.collections).values({
      customerId: data.customerId,
      amount: data.amount.toFixed(2),
      paymentMethodId: data.paymentMethodId,
      note: data.note,
      createdById: session.userId,
    });
  });
  await logAudit({ action: "CREATE", entityType: "Collection", entityId: data.customerId, after: data });
  revalidatePath("/customers");
  revalidatePath("/cash");
}

// بيرجع كل الحركات من `from` لحد دلوقتي (مش لحد `to`) - `buildCustomerTimeline` محتاجة الحركات
// دي كلها عشان تحسب الرصيد الصحيح عند نهاية الفترة `to`، حتى لو `to` تاريخ قديم وفيه حركات بعده
// لحد النهاردة. الفلترة على `to` بتحصل في `buildCustomerTimeline` نفسها وقت العرض.
export async function customerStatement(customerId: string, from: Date, to: Date) {
  await requireAnyPermission(["customers.manage", "customers.statement"]);
  const invoices = await db
    .select()
    .from(schema.salesInvoices)
    .where(and(eq(schema.salesInvoices.customerId, customerId), gte(schema.salesInvoices.createdAt, from)))
    .orderBy(schema.salesInvoices.createdAt);
  const payments = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.customerId, customerId), gte(schema.collections.createdAt, from)))
    .orderBy(schema.collections.createdAt);
  return { invoices, payments };
}

export async function searchEverything(q: string) {
  // كان بيتأكد بس من وجود جلسة (requireSession) من غير أي تحقق صلاحية فعلي - أي مستخدم مسجل دخول
  // بغض النظر عن دوره كان يقدر يبحث ويشوف بيانات عملاء وفواتير حتى لو مالوش صلاحية "إدارة العملاء"
  // ولا "عرض الفواتير" أصلًا، من خلال شاشة البحث الشامل بس (تخطي كامل لنظام الصلاحيات).
  // البحث ده بينادى من مربّع البحث الظاهر في كل صفحة في السيستم - فحص الصلاحيتين كان بيتبعت مع بعض
  // في نفس اللحظة (وكل واحد منهم بيفتح لوحده حتى 3 اتصالات جوّاه)، وده بيتكرر مع كل استخدام للبحث.
  // رجّعناهم يتبعتوا واحد ورا التاني، وبعد ما نتأكد إن فيه نص كفاية للبحث الأول (توفير فحص صلاحية
  // من غير داعي لو الخانة فاضية أو حرف واحد بس).
  if (!q || q.length < 2) return { customers: [], invoices: [] };
  const canCustomers = await canAny(["customers.manage", "customers.statement"]);
  const canInvoices = await can("sales.view");
  const customers = canCustomers
    ? await db
        .select()
        .from(schema.customers)
        .where(or(ilike(schema.customers.name, `%${q}%`), ilike(schema.customers.phone, `%${q}%`)))
        .limit(10)
    : [];
  const invoices = canInvoices
    ? await db
        .select()
        .from(schema.salesInvoices)
        .where(ilike(schema.salesInvoices.code, `%${q}%`))
        .limit(10)
    : [];
  return { customers, invoices };
}
