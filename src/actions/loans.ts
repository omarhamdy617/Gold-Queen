"use server";
import { db, schema } from "@/db";
import { eq, desc, ilike, or } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { postCashByPaymentMethod, updateLoanAccountBalance } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

// حساب سلفة: رصيد تراكمي لأي شخص (موظف أو غيره) - موجب = هو مديون لينا (سلّفناه)، سالب = إحنا
// مديونين له (استلفنا منه). كل حساب بيحتفظ بسجل حركاته الكامل في loanTransactions.
export async function listLoanAccounts(search?: string) {
  await requirePermission("loans.manage");
  const rows = await db
    .select()
    .from(schema.loanAccounts)
    .where(search ? or(ilike(schema.loanAccounts.name, `%${search}%`), ilike(schema.loanAccounts.phone, `%${search}%`)) : undefined)
    .orderBy(schema.loanAccounts.name);
  return rows;
}

export async function createLoanAccount(data: { name: string; phone?: string; notes?: string }) {
  try {
    return await createLoanAccountInner(data);
  } catch (e) {
    return toActionError(e, "تعذر إضافة حساب السلفة");
  }
}

async function createLoanAccountInner(data: Parameters<typeof createLoanAccount>[0]) {
  await requirePermission("loans.manage");
  if (!data.name?.trim()) throw new Error("اسم الشخص مطلوب");
  const phone = data.phone ? normalizePhone(data.phone) : undefined;
  const [a] = await db.insert(schema.loanAccounts).values({ name: data.name.trim(), phone, notes: data.notes }).returning();
  await logAudit({ action: "CREATE", entityType: "LoanAccount", entityId: a.id, after: a });
  revalidatePath("/loans");
  return a;
}

export async function getLoanAccount(id: string) {
  await requirePermission("loans.manage");
  const [account] = await db.select().from(schema.loanAccounts).where(eq(schema.loanAccounts.id, id));
  if (!account) return null;
  const txRows = await db
    .select()
    .from(schema.loanTransactions)
    .where(eq(schema.loanTransactions.loanAccountId, id))
    .orderBy(desc(schema.loanTransactions.createdAt));
  const userIds = Array.from(new Set(txRows.map((t) => t.createdById).filter(Boolean))) as string[];
  const pmIds = Array.from(new Set(txRows.map((t) => t.paymentMethodId).filter(Boolean))) as string[];
  const users = userIds.length ? await db.select().from(schema.users) : [];
  const pms = pmIds.length ? await db.select().from(schema.paymentMethods) : [];
  const userMap: Record<string, string> = {};
  for (const u of users) if (userIds.includes(u.id)) userMap[u.id] = u.fullName;
  const pmMap: Record<string, string> = {};
  for (const p of pms) if (pmIds.includes(p.id)) pmMap[p.id] = p.name;
  const transactions = txRows.map((t) => ({
    ...t,
    createdByName: t.createdById ? userMap[t.createdById] || "-" : "-",
    paymentMethodName: t.paymentMethodId ? pmMap[t.paymentMethodId] || "-" : "-",
  }));
  return { account, transactions };
}

export async function recordLoanTransaction(data: {
  loanAccountId: string;
  type: "LOAN_GIVEN" | "LOAN_TAKEN" | "REPAYMENT_RECEIVED" | "REPAYMENT_PAID";
  amount: number;
  paymentMethodId?: string;
  note?: string;
}) {
  try {
    return await recordLoanTransactionInner(data);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل حركة السلفة");
  }
}

async function recordLoanTransactionInner(data: Parameters<typeof recordLoanTransaction>[0]) {
  await requirePermission("loans.manage");
  const session = await requireSession();
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("مبلغ الحركة لازم يكون رقم أكبر من صفر");
  }
  // نقدية بتتحرك فعليًا من/لخزينة - لازم تحديد طريقة الدفع عشان نعرف نسجل الحركة في الخزينة الصح
  if (!data.paymentMethodId) throw new Error("لازم تحدد الخزينة/طريقة الدفع اللي هيتحرك منها أو ليها المبلغ");

  // LOAN_GIVEN و REPAYMENT_PAID بيقللوا كاش (خارج)، LOAN_TAKEN و REPAYMENT_RECEIVED بيزودوا كاش (داخل)
  const cashDirection: Record<string, "in" | "out"> = {
    LOAN_GIVEN: "out",
    REPAYMENT_PAID: "out",
    LOAN_TAKEN: "in",
    REPAYMENT_RECEIVED: "in",
  };
  // موجب للرصيد (الشخص مديون لينا أكتر) في LOAN_GIVEN و REPAYMENT_PAID، وسالب في LOAN_TAKEN و REPAYMENT_RECEIVED
  const balanceDelta: Record<string, number> = {
    LOAN_GIVEN: data.amount,
    REPAYMENT_PAID: data.amount,
    LOAN_TAKEN: -data.amount,
    REPAYMENT_RECEIVED: -data.amount,
  };
  const typeLabels: Record<string, string> = {
    LOAN_GIVEN: "سلفة معطاة",
    LOAN_TAKEN: "سلفة مستلمة (استلفنا)",
    REPAYMENT_RECEIVED: "تحصيل سلفة",
    REPAYMENT_PAID: "سداد سلفة",
  };

  await db.transaction(async (tx) => {
    const [account] = await tx.select().from(schema.loanAccounts).where(eq(schema.loanAccounts.id, data.loanAccountId)).for("update");
    if (!account) throw new Error("حساب السلفة غير موجود");
    await postCashByPaymentMethod(tx, data.paymentMethodId!, cashDirection[data.type] === "out" ? "LOAN_OUT" : "LOAN_IN", data.amount, {
      note: data.note || `${typeLabels[data.type]} - ${account.name}`,
      refType: "LoanAccount",
      refId: account.id,
      createdById: session.userId,
      direction: cashDirection[data.type],
    });
    await updateLoanAccountBalance(tx, data.loanAccountId, balanceDelta[data.type]);
    await tx.insert(schema.loanTransactions).values({
      loanAccountId: data.loanAccountId,
      type: data.type,
      amount: data.amount.toFixed(2),
      paymentMethodId: data.paymentMethodId,
      note: data.note,
      createdById: session.userId,
    });
  });

  await logAudit({ action: "CREATE", entityType: "LoanTransaction", entityId: data.loanAccountId, after: data });
  revalidatePath("/loans");
  revalidatePath("/cash");
}

export async function toggleLoanAccountActive(id: string, active: boolean) {
  try {
    await requirePermission("loans.manage");
    await db.update(schema.loanAccounts).set({ active }).where(eq(schema.loanAccounts.id, id));
    await logAudit({ action: "UPDATE", entityType: "LoanAccount", entityId: id, after: { active } });
    revalidatePath("/loans");
  } catch (e) {
    return toActionError(e, "تعذر تحديث حالة الحساب");
  }
}
