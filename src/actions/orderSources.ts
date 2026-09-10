"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession } from "@/lib/auth";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

// مصادر الأوردر (الموقع/تليفون/واتساب/فيسبوك/أخرى...) بقت جدول حقيقي قابل للإضافة والتعديل من
// شاشة الإعدادات بدل ما تكون قيم enum ثابتة في قاعدة البيانات محتاجة migration كل مرة حد يحب
// يضيف مصدر جديد (زي TikTok أو Instagram مثلًا). نفس أسلوب locations بالظبط (listLocations/
// updateLocation/deleteLocation في src/actions/products.ts).

// المصادر المفعّلة بس - للقوائم المنسدلة وقت تسجيل فاتورة/أوردر جديد (متاحة لأي حد مسجل دخول،
// زي listPaymentMethods بالظبط - مش محتاجة صلاحية settings.manage عشان أي حد بيسجل فاتورة أو
// أوردر محتاج يشوفها).
export async function listOrderSources() {
  await requireSession();
  return db.select().from(schema.orderSources).where(eq(schema.orderSources.active, true));
}

// كل المصادر حتى المعطّلة - لشاشة الإعدادات (لازم تشوفهم عشان تقدر تفعّلهم تاني) ولعرض اسم
// المصدر في شاشات الفواتير/الأوردرات حتى لو المصدر ده اتعطّل بعد كده
export async function listAllOrderSources() {
  await requireSession();
  return db.select().from(schema.orderSources);
}

export async function createOrderSource(name: string) {
  try {
    await requirePermission("settings.manage");
    if (!name?.trim()) throw new Error("اسم مصدر الأوردر مطلوب");
    const [src] = await db.insert(schema.orderSources).values({ name: name.trim() }).returning();
    revalidatePath("/settings");
    revalidatePath("/sales/new");
    revalidatePath("/orders");
    return src;
  } catch (e) {
    return toActionError(e, "تعذر إضافة المصدر - يمكن الاسم ده مستخدم بالفعل لمصدر تاني");
  }
}

// تعديل اسم المصدر، أو تعطيله وتفعيله تاني (active) - نفس أسلوب updateLocation بالظبط
export async function updateOrderSource(id: string, data: Partial<{ name: string; active: boolean }>) {
  try {
    await requirePermission("settings.manage");
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("اسم مصدر الأوردر مطلوب");
      payload.name = data.name.trim();
    }
    if (data.active !== undefined) payload.active = data.active;
    if (Object.keys(payload).length === 0) return;
    await db.update(schema.orderSources).set(payload).where(eq(schema.orderSources.id, id));
    revalidatePath("/settings");
    revalidatePath("/sales/new");
    revalidatePath("/orders");
  } catch (e) {
    return toActionError(e, "تعذر تعديل المصدر - يمكن الاسم ده مستخدم بالفعل لمصدر تاني");
  }
}

// حذف حقيقي - بس لو المصدر ده مش مستخدم في أي فاتورة بيع أو أوردر قبل كده. غير كده بنرفض الحذف
// برسالة واضحة وننصح بالتعطيل بدل الحذف (نفس أسلوب deleteLocation بالظبط) - عمود source مرتبط
// NOT NULL بجدولين (sales_invoices, orders)، فحذف مصدر له تاريخ استخدام هيبوّظ الفواتير/الأوردرات
// القديمة المرتبطة بيه.
export async function deleteOrderSource(id: string) {
  try {
    await requirePermission("settings.manage");
    const [invRow] = await db.select({ id: schema.salesInvoices.id }).from(schema.salesInvoices).where(eq(schema.salesInvoices.source, id)).limit(1);
    if (invRow) throw new Error("متقدرش تمسح المصدر ده - مرتبط بفواتير بيع سابقة. استخدم زرار التعطيل بدل الحذف عشان تحافظ على سجل الفواتير القديمة.");
    const [ordRow] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.source, id)).limit(1);
    if (ordRow) throw new Error("متقدرش تمسح المصدر ده - مرتبط بأوردرات سابقة. استخدم زرار التعطيل بدل الحذف.");
    await db.delete(schema.orderSources).where(eq(schema.orderSources.id, id));
    revalidatePath("/settings");
  } catch (e) {
    return toActionError(e, "تعذر حذف المصدر");
  }
}
