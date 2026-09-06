"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { postCashByPaymentMethod, lockDrawersInOrder } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

export async function listExpenseCategories() {
  // كانت من غير أي تحقق صلاحية خالص - عدم اتساق مع باقي دوال الملف (createExpenseCategory/
  // listExpenses بيتحققوا من "expenses.manage")؛ أي مستخدم عنده جلسة كان يقدر يجيب قائمة الفئات
  await requirePermission("expenses.manage");
  return db.select().from(schema.expenseCategories);
}

export async function createExpenseCategory(name: string) {
  await requirePermission("expenses.manage");
  const [c] = await db.insert(schema.expenseCategories).values({ name }).returning();
  revalidatePath("/expenses");
  return c;
}

export async function createExpense(input: { categoryId: string; amount: number; paymentMethodId: string; note?: string }) {
  try {
    return await createExpenseInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل المصروف");
  }
}

async function createExpenseInner(input: Parameters<typeof createExpense>[0]) {
  await requirePermission("expenses.manage");
  // كان ممكن يتسجل مصروف بمبلغ سالب أو صفر من غير رفض - وده كان بيقلل "صافي الربح" بشكل غلط
  // (بيزوّده فعليًا بدل ما ينقص) من غير أي حركة خصم مقابلة في الخزينة.
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("مبلغ المصروف لازم يكون رقم أكبر من صفر");
  }
  const session = await requireSession();
  const result = await db.transaction(async (tx) => {
    const [exp] = await tx
      .insert(schema.expenses)
      .values({ categoryId: input.categoryId, amount: input.amount.toFixed(2), paymentMethodId: input.paymentMethodId, note: input.note, createdById: session.userId })
      .returning();
    await postCashByPaymentMethod(tx, input.paymentMethodId, "EXPENSE_OUT", input.amount, {
      note: input.note || "مصروف",
      refType: "Expense",
      refId: exp.id,
      createdById: session.userId,
    });
    return exp;
  });
  await logAudit({ action: "CREATE", entityType: "Expense", entityId: result.id, after: result });
  revalidatePath("/expenses");
  revalidatePath("/cash");
  return result;
}

// تعديل مصروف مسجل قبل كده - قبل كده مفيش أي طريقة تصحح بيها غلطة بسيطة في مبلغ/فئة مصروف غير
// تسوية خزينة يدوية منفصلة، وده كان بيسيب أثرين مش مترابطين في السجلات بدل تصحيح واحد واضح.
// التعديل هنا بيعكس أثر المبلغ القديم في الخزينة ويطبق الجديد بدل ما يسيب أثرين منفصلين.
export async function updateExpense(id: string, input: { categoryId: string; amount: number; paymentMethodId: string; note?: string }) {
  try {
    return await updateExpenseInner(id, input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ تعديل المصروف");
  }
}

async function updateExpenseInner(id: string, input: Parameters<typeof updateExpense>[1]) {
  await requirePermission("expenses.manage");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("مبلغ المصروف لازم يكون رقم أكبر من صفر");
  }
  const session = await requireSession();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.expenses).where(eq(schema.expenses.id, id)).for("update");
    if (!existing) throw new Error("المصروف غير موجود");
    // احتمال Deadlock: التعديل ده بيلمس خزينتين (القديمة والجديدة) بترتيب ثابت (قديمة الأول، جديدة
    // بعدها) - لو حصل تعديل تاني متزامن على مصروف تاني بيبدّل بين نفس الخزينتين بالعكس بالظبط،
    // كل معاملة ممكن تستنى قفل ماسكه التانية (تعطل متبادل). بنقفل الاتنين بترتيب ثابت (مرتب
    // أبجديًا) الأول قبل أي تعديل فعلي، عشان أي معاملتين بيلمسوا نفس الخزينتين يستنوا بنفس الترتيب دايمًا.
    await lockDrawersInOrder(tx, [existing.paymentMethodId, input.paymentMethodId]);
    // اعكس المبلغ القديم من خزينته القديمة، وبعدين طبّق المبلغ الجديد على الخزينة الجديدة
    await postCashByPaymentMethod(tx, existing.paymentMethodId, "ADJUSTMENT", Number(existing.amount), {
      note: `عكس مصروف قديم قبل التعديل`,
      refType: "Expense",
      refId: id,
      createdById: session.userId,
      direction: "in",
    });
    await postCashByPaymentMethod(tx, input.paymentMethodId, "EXPENSE_OUT", input.amount, {
      note: input.note || "مصروف (بعد تعديل)",
      refType: "Expense",
      refId: id,
      createdById: session.userId,
    });
    const [updated] = await tx
      .update(schema.expenses)
      .set({ categoryId: input.categoryId, amount: input.amount.toFixed(2), paymentMethodId: input.paymentMethodId, note: input.note })
      .where(eq(schema.expenses.id, id))
      .returning();
    return { before: existing, after: updated };
  });
  await logAudit({ action: "UPDATE", entityType: "Expense", entityId: id, before: result.before, after: result.after });
  revalidatePath("/expenses");
  revalidatePath("/cash");
  return result.after;
}

export async function deleteExpense(id: string) {
  try {
    return await deleteExpenseInner(id);
  } catch (e) {
    return toActionError(e, "تعذر حذف المصروف");
  }
}

async function deleteExpenseInner(id: string) {
  await requirePermission("expenses.manage");
  const session = await requireSession();
  let expenseForAudit: any = null;
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.expenses).where(eq(schema.expenses.id, id)).for("update");
    if (!existing) throw new Error("المصروف غير موجود (يمكن اتمسح بالفعل)");
    expenseForAudit = existing;
    // رجّع المبلغ للخزينة اللي اتخصم منها
    await postCashByPaymentMethod(tx, existing.paymentMethodId, "ADJUSTMENT", Number(existing.amount), {
      note: `إلغاء/حذف مصروف`,
      refType: "Expense",
      refId: id,
      createdById: session.userId,
      direction: "in",
    });
    await tx.delete(schema.expenses).where(eq(schema.expenses.id, id));
  });
  await logAudit({ action: "DELETE", entityType: "Expense", entityId: id, before: expenseForAudit });
  revalidatePath("/expenses");
  revalidatePath("/cash");
}

export async function listExpenses() {
  await requirePermission("expenses.manage");
  const rows = await db
    .select({
      id: schema.expenses.id,
      amount: schema.expenses.amount,
      note: schema.expenses.note,
      createdAt: schema.expenses.createdAt,
      categoryId: schema.expenses.categoryId,
      categoryName: schema.expenseCategories.name,
      paymentMethodId: schema.expenses.paymentMethodId,
      paymentMethodName: schema.paymentMethods.name,
    })
    .from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
    .innerJoin(schema.paymentMethods, eq(schema.expenses.paymentMethodId, schema.paymentMethods.id))
    .orderBy(desc(schema.expenses.createdAt));
  return rows;
}
