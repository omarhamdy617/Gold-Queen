"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { postCashByPaymentMethod } from "@/lib/ops";
import { revalidatePath } from "next/cache";

export async function listExpenseCategories() {
  return db.select().from(schema.expenseCategories);
}

export async function createExpenseCategory(name: string) {
  await requirePermission("expenses.manage");
  const [c] = await db.insert(schema.expenseCategories).values({ name }).returning();
  revalidatePath("/expenses");
  return c;
}

export async function createExpense(input: { categoryId: string; amount: number; paymentMethodId: string; note?: string }) {
  await requirePermission("expenses.manage");
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

export async function listExpenses() {
  await requirePermission("expenses.manage");
  const rows = await db
    .select({
      id: schema.expenses.id,
      amount: schema.expenses.amount,
      note: schema.expenses.note,
      createdAt: schema.expenses.createdAt,
      categoryName: schema.expenseCategories.name,
      paymentMethodName: schema.paymentMethods.name,
    })
    .from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
    .innerJoin(schema.paymentMethods, eq(schema.expenses.paymentMethodId, schema.paymentMethods.id))
    .orderBy(desc(schema.expenses.createdAt));
  return rows;
}
