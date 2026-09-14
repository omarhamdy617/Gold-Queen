"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { postCashByPaymentMethod, lockDrawersInOrder } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

// شاشة "الإيرادات" دي لأي فلوس داخلة على الشركة مش ناتجة عن فاتورة بيع أو تحصيل أوردر أو تحصيل
// من تاجر/عميل (اللي كل واحدة فيهم ليها مسارها الخاص أصلًا وبتدخل الخزينة تلقائيًا) - يعني إيراد
// من مصدر تاني زي عمولة، أو استرداد، أو أي دخل متفرق تاني. بنفس منطق شاشة المصروفات بالظبط بس
// بالعكس: هنا كل عملية بتزوّد الخزينة بدل ما تنقصها.

export async function listIncomeCategories() {
  await requirePermission("income.manage");
  return db.select().from(schema.incomeCategories);
}

export async function createIncomeCategory(name: string) {
  await requirePermission("income.manage");
  const [c] = await db.insert(schema.incomeCategories).values({ name }).returning();
  revalidatePath("/income");
  return c;
}

export async function deleteIncomeCategory(id: string) {
  try {
    return await deleteIncomeCategoryInner(id);
  } catch (e) {
    return toActionError(e, "تعذر حذف التصنيف");
  }
}

// نفس حماية deleteExpenseCategory بالظبط (شوف التعليق هناك) - رفض الحذف برسالة واضحة لو فيه أي
// إيراد مستخدم التصنيف ده قبل كده، بدل ما نسيب قيد الـ foreign key يرفضه برسالة تقنية.
async function deleteIncomeCategoryInner(id: string) {
  await requirePermission("income.manage");
  const [row] = await db.select({ id: schema.income.id }).from(schema.income).where(eq(schema.income.categoryId, id)).limit(1);
  if (row) throw new Error('متقدرش تمسح التصنيف ده - مستخدم في إيراد أو أكتر مسجّل قبل كده. غيّر تصنيف الإيرادات دي لتصنيف تاني الأول لو عايز تمسحه.');
  const [deleted] = await db.delete(schema.incomeCategories).where(eq(schema.incomeCategories.id, id)).returning();
  if (!deleted) throw new Error("التصنيف غير موجود (يمكن اتمسح بالفعل)");
  revalidatePath("/settings");
  revalidatePath("/income");
  return deleted;
}

export async function createIncome(input: { categoryId: string; amount: number; paymentMethodId: string; note?: string }) {
  try {
    return await createIncomeInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل الإيراد");
  }
}

async function createIncomeInner(input: Parameters<typeof createIncome>[0]) {
  await requirePermission("income.manage");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("مبلغ الإيراد لازم يكون رقم أكبر من صفر");
  }
  const session = await requireSession();
  const result = await db.transaction(async (tx) => {
    const [inc] = await tx
      .insert(schema.income)
      .values({ categoryId: input.categoryId, amount: input.amount.toFixed(2), paymentMethodId: input.paymentMethodId, note: input.note, createdById: session.userId })
      .returning();
    await postCashByPaymentMethod(tx, input.paymentMethodId, "OTHER_INCOME_IN", input.amount, {
      note: input.note || "إيراد",
      refType: "Income",
      refId: inc.id,
      createdById: session.userId,
    });
    return inc;
  });
  await logAudit({ action: "CREATE", entityType: "Income", entityId: result.id, after: result });
  revalidatePath("/income");
  revalidatePath("/cash");
  return result;
}

// تعديل إيراد مسجل قبل كده - بنفس مبدأ تعديل المصروف بالظبط: بنعكس أثر المبلغ القديم في الخزينة
// (هنا بالخصم، لأن الإيراد الأصلي كان بالإضافة) وبعدين بنطبّق المبلغ الجديد.
export async function updateIncome(id: string, input: { categoryId: string; amount: number; paymentMethodId: string; note?: string }) {
  try {
    return await updateIncomeInner(id, input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ تعديل الإيراد");
  }
}

async function updateIncomeInner(id: string, input: Parameters<typeof updateIncome>[1]) {
  await requirePermission("income.manage");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("مبلغ الإيراد لازم يكون رقم أكبر من صفر");
  }
  const session = await requireSession();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.income).where(eq(schema.income.id, id)).for("update");
    if (!existing) throw new Error("الإيراد غير موجود");
    // نفس احتياط منع الـ deadlock الموجود في تعديل المصروفات - قفل الخزينتين (القديمة والجديدة)
    // بترتيب ثابت قبل أي تعديل فعلي.
    await lockDrawersInOrder(tx, [existing.paymentMethodId, input.paymentMethodId]);
    // اعكس المبلغ القديم من خزينته القديمة (بالخصم - عكس الإضافة الأصلية)، وبعدين طبّق المبلغ
    // الجديد على الخزينة الجديدة (بالإضافة)
    await postCashByPaymentMethod(tx, existing.paymentMethodId, "ADJUSTMENT", Number(existing.amount), {
      note: `عكس إيراد قديم قبل التعديل`,
      refType: "Income",
      refId: id,
      createdById: session.userId,
      direction: "out",
    });
    await postCashByPaymentMethod(tx, input.paymentMethodId, "OTHER_INCOME_IN", input.amount, {
      note: input.note || "إيراد (بعد تعديل)",
      refType: "Income",
      refId: id,
      createdById: session.userId,
    });
    const [updated] = await tx
      .update(schema.income)
      .set({ categoryId: input.categoryId, amount: input.amount.toFixed(2), paymentMethodId: input.paymentMethodId, note: input.note })
      .where(eq(schema.income.id, id))
      .returning();
    return { before: existing, after: updated };
  });
  await logAudit({ action: "UPDATE", entityType: "Income", entityId: id, before: result.before, after: result.after });
  revalidatePath("/income");
  revalidatePath("/cash");
  return result.after;
}

export async function deleteIncome(id: string) {
  try {
    return await deleteIncomeInner(id);
  } catch (e) {
    return toActionError(e, "تعذر حذف الإيراد");
  }
}

async function deleteIncomeInner(id: string) {
  await requirePermission("income.manage");
  const session = await requireSession();
  let incomeForAudit: any = null;
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.income).where(eq(schema.income.id, id)).for("update");
    if (!existing) throw new Error("الإيراد غير موجود (يمكن اتمسح بالفعل)");
    incomeForAudit = existing;
    // اخصم المبلغ من الخزينة اللي كان دخلها
    await postCashByPaymentMethod(tx, existing.paymentMethodId, "ADJUSTMENT", Number(existing.amount), {
      note: `إلغاء/حذف إيراد`,
      refType: "Income",
      refId: id,
      createdById: session.userId,
      direction: "out",
    });
    await tx.delete(schema.income).where(eq(schema.income.id, id));
  });
  await logAudit({ action: "DELETE", entityType: "Income", entityId: id, before: incomeForAudit });
  revalidatePath("/income");
  revalidatePath("/cash");
}

export async function listIncome() {
  await requirePermission("income.manage");
  const rows = await db
    .select({
      id: schema.income.id,
      amount: schema.income.amount,
      note: schema.income.note,
      createdAt: schema.income.createdAt,
      categoryId: schema.income.categoryId,
      categoryName: schema.incomeCategories.name,
      paymentMethodId: schema.income.paymentMethodId,
      paymentMethodName: schema.paymentMethods.name,
    })
    .from(schema.income)
    .innerJoin(schema.incomeCategories, eq(schema.income.categoryId, schema.incomeCategories.id))
    .innerJoin(schema.paymentMethods, eq(schema.income.paymentMethodId, schema.paymentMethods.id))
    .orderBy(desc(schema.income.createdAt));
  return rows;
}
