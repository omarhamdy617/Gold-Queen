"use server";
import { db, schema } from "@/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, can } from "@/lib/auth";
import { postCashByPaymentMethod } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { money } from "@/lib/format";
import { getProfitSummary } from "@/actions/reports";
import { revalidatePath } from "next/cache";

// شاشة "رأس المال والمسحوبات": فلوس صاحب الشغل الداخلة للشركة (رأس مال) والخارجة لنفسه (مسحوبات).
// قبل كده الطريقة الوحيدة لتسجيل الاتنين كانت "تسوية يدوية" على الخزينة - وده كان بيخلطهم مع تصحيحات
// الجرد في رقم واحد، ومفيش أي مكان يقولك سحبت كام أو هل سحبت أكتر من اللي الشغل كسبه.
// مهم: المسحوبات مش مصروف - مش بتقلل صافي الربح، لأنها توزيع لربح اتعمل خلاص مش تكلفة تشغيل.

type Kind = "CAPITAL_IN" | "OWNER_DRAW";

export async function recordCapitalMovement(input: { kind: Kind; paymentMethodId: string; amount: number; note?: string }) {
  try {
    return await recordCapitalMovementInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل الحركة");
  }
}

async function recordCapitalMovementInner(input: { kind: Kind; paymentMethodId: string; amount: number; note?: string }) {
  await requirePermission("capital.manage");
  if (input.kind !== "CAPITAL_IN" && input.kind !== "OWNER_DRAW") throw new Error("نوع الحركة غير صحيح");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("المبلغ لازم يكون رقم أكبر من صفر");
  if (!input.paymentMethodId) throw new Error("اختار الخزينة");
  const session = await requireSession();
  const note = input.note?.trim() || null;
  const isDraw = input.kind === "OWNER_DRAW";

  const result = await db.transaction(async (tx) => {
    // السحب بيترفض لو أكبر من رصيد الخزينة المسجّل - مينفعش فعليًا تسحب فلوس مش موجودة. باقي العمليات
    // في السيستم (زي الدفع لمورد) مش بتعمل الفحص ده لسه، وده سبب إن فيه خزائن رصيدها بالسالب حاليًا.
    if (isDraw) {
      const [drawer] = await tx
        .select()
        .from(schema.cashDrawers)
        .where(eq(schema.cashDrawers.paymentMethodId, input.paymentMethodId))
        .for("update");
      if (!drawer) throw new Error("لا توجد خزينة مرتبطة بطريقة الدفع دي");
      const balance = Number(drawer.balance);
      if (balance < input.amount) {
        throw new Error(
          `رصيد ${drawer.name} في السيستم ${money(balance)} بس، فمينفعش تسحب منها ${money(input.amount)}. لو الرصيد الفعلي في إيدك أكبر من كده، صحّح رصيد الخزينة الأول بتسوية يدوية من صفحة الخزائن، وبعدين سجّل السحب.`
        );
      }
    }
    const [row] = await tx
      .insert(schema.capitalMovements)
      .values({ kind: input.kind, amount: input.amount.toFixed(2), paymentMethodId: input.paymentMethodId, note, createdById: session.userId })
      .returning();
    await postCashByPaymentMethod(tx, input.paymentMethodId, isDraw ? "OWNER_DRAW_OUT" : "CAPITAL_IN", input.amount, {
      note: (isDraw ? "مسحوبات شخصية" : "إيداع رأس مال") + (note ? `: ${note}` : ""),
      refType: "CapitalMovement",
      refId: row.id,
      createdById: session.userId,
      direction: isDraw ? "out" : "in",
    });
    return row;
  });

  await logAudit({ action: "CREATE", entityType: "CapitalMovement", entityId: result.id, after: result });
  revalidatePath("/capital");
  revalidatePath("/cash");
  return result;
}

// حذف حركة اتسجلت غلط - بيعكس أثرها في الخزينة بحركة تسوية موثّقة (نفس أسلوب حذف المصروف/الإيراد)،
// وبيشيلها من إجماليات رأس المال والمسحوبات.
export async function deleteCapitalMovement(id: string) {
  try {
    return await deleteCapitalMovementInner(id);
  } catch (e) {
    return toActionError(e, "تعذر حذف الحركة");
  }
}

async function deleteCapitalMovementInner(id: string) {
  await requirePermission("capital.manage");
  const session = await requireSession();
  let before: any = null;
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.capitalMovements).where(eq(schema.capitalMovements.id, id)).for("update");
    if (!existing) throw new Error("الحركة غير موجودة (يمكن اتمسحت بالفعل)");
    before = existing;
    const wasDraw = existing.kind === "OWNER_DRAW";
    await postCashByPaymentMethod(tx, existing.paymentMethodId, "ADJUSTMENT", Number(existing.amount), {
      note: wasDraw ? "إلغاء/حذف مسحوبات شخصية" : "إلغاء/حذف إيداع رأس مال",
      refType: "CapitalMovement",
      refId: id,
      createdById: session.userId,
      // عكس الحركة الأصلية: السحب كان خارج فالإلغاء بيرجّع الفلوس للخزينة، والإيداع كان داخل فالإلغاء بيخصمها
      direction: wasDraw ? "in" : "out",
    });
    await tx.delete(schema.capitalMovements).where(eq(schema.capitalMovements.id, id));
  });
  await logAudit({ action: "DELETE", entityType: "CapitalMovement", entityId: id, before });
  revalidatePath("/capital");
  revalidatePath("/cash");
}

// كل اللي الشاشة محتاجاه في نداء واحد - الاستعلامات بتتبعت واحد ورا التاني (مش Promise.all) عمدًا،
// نفس درس الدفعات 19-20 عن عدد الاتصالات المتزامنة بقاعدة البيانات.
export async function getCapitalPageData(from: Date, to: Date) {
  await requirePermission("capital.manage");

  // الخزائن هنا بتتجاب تحت صلاحية capital.manage نفسها (مش cash.view) - عشان أي حد مسموح له يسجّل
  // سحب يقدر يشوف رصيد الخزينة اللي هيسحب منها، حتى لو مش مدّيله صلاحية شاشة الخزائن كلها.
  const drawers = await db
    .select({
      paymentMethodId: schema.paymentMethods.id,
      name: schema.paymentMethods.name,
      balance: schema.cashDrawers.balance,
    })
    .from(schema.cashDrawers)
    .innerJoin(schema.paymentMethods, eq(schema.cashDrawers.paymentMethodId, schema.paymentMethods.id))
    .where(eq(schema.paymentMethods.active, true));

  const periodRows = await db
    .select({ kind: schema.capitalMovements.kind, total: sql<string>`coalesce(sum(${schema.capitalMovements.amount}), 0)` })
    .from(schema.capitalMovements)
    .where(and(gte(schema.capitalMovements.createdAt, from), lte(schema.capitalMovements.createdAt, to)))
    .groupBy(schema.capitalMovements.kind);

  const allTimeRows = await db
    .select({ kind: schema.capitalMovements.kind, total: sql<string>`coalesce(sum(${schema.capitalMovements.amount}), 0)` })
    .from(schema.capitalMovements)
    .groupBy(schema.capitalMovements.kind);

  const sumOf = (rows: { kind: string; total: string }[], kind: Kind) => Number(rows.find((r) => r.kind === kind)?.total || 0);

  // مقارنة المسحوبات بصافي الربح محتاجة صلاحية "عرض التقارير" (نفس صلاحية شاشة الأرباح) - لو مش موجودة
  // بنعرض الإجماليات بس من غير المقارنة، بدل ما الصفحة كلها تفشل.
  const canSeeProfit = await can("reports.view");
  let periodNetProfit: number | null = null;
  let allTimeNetProfit: number | null = null;
  if (canSeeProfit) {
    periodNetProfit = (await getProfitSummary(from, to)).netProfit;
    allTimeNetProfit = (await getProfitSummary(new Date(0), new Date())).netProfit;
  }

  const movements = await db
    .select({
      id: schema.capitalMovements.id,
      kind: schema.capitalMovements.kind,
      amount: schema.capitalMovements.amount,
      note: schema.capitalMovements.note,
      createdAt: schema.capitalMovements.createdAt,
      paymentMethodName: schema.paymentMethods.name,
      createdByName: schema.users.fullName,
    })
    .from(schema.capitalMovements)
    .innerJoin(schema.paymentMethods, eq(schema.capitalMovements.paymentMethodId, schema.paymentMethods.id))
    .leftJoin(schema.users, eq(schema.capitalMovements.createdById, schema.users.id))
    .orderBy(desc(schema.capitalMovements.createdAt))
    .limit(200);

  return {
    drawers,
    period: { capitalIn: sumOf(periodRows, "CAPITAL_IN"), draws: sumOf(periodRows, "OWNER_DRAW"), netProfit: periodNetProfit },
    allTime: { capitalIn: sumOf(allTimeRows, "CAPITAL_IN"), draws: sumOf(allTimeRows, "OWNER_DRAW"), netProfit: allTimeNetProfit },
    movements,
  };
}
