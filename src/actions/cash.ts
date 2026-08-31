"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { postCashByPaymentMethod } from "@/lib/ops";
import { revalidatePath } from "next/cache";

export async function listCashDrawers() {
  await requirePermission("cash.view");
  const rows = await db
    .select({
      id: schema.cashDrawers.id,
      name: schema.cashDrawers.name,
      balance: schema.cashDrawers.balance,
      paymentMethodName: schema.paymentMethods.name,
      paymentMethodId: schema.paymentMethods.id,
    })
    .from(schema.cashDrawers)
    .leftJoin(schema.paymentMethods, eq(schema.cashDrawers.paymentMethodId, schema.paymentMethods.id));
  return rows;
}

export async function createPaymentMethodWithDrawer(name: string) {
  await requirePermission("settings.manage");
  const [pm] = await db.insert(schema.paymentMethods).values({ name }).returning();
  await db.insert(schema.cashDrawers).values({ name: `خزينة ${name}`, paymentMethodId: pm.id });
  await logAudit({ action: "CREATE", entityType: "PaymentMethod", entityId: pm.id, after: pm });
  revalidatePath("/cash");
  return pm;
}

export async function adjustCashDrawer(paymentMethodId: string, amount: number, note: string) {
  await requirePermission("cash.adjust");
  const session = await requireSession();
  await db.transaction(async (tx) => {
    await postCashByPaymentMethod(tx, paymentMethodId, "ADJUSTMENT", Math.abs(amount), {
      note: (amount >= 0 ? "تسوية إضافة: " : "تسوية خصم: ") + note,
      createdById: session.userId,
      direction: amount >= 0 ? "in" : "out",
    });
  });
  await logAudit({ action: "ADJUST", entityType: "CashDrawer", entityId: paymentMethodId, after: { amount, note } });
  revalidatePath("/cash");
}

export async function listCashTransactions(drawerId?: string) {
  await requirePermission("cash.view");
  const rows = await db.query.cashTransactions.findMany({
    where: drawerId ? eq(schema.cashTransactions.drawerId, drawerId) : undefined,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 200,
  });
  const userIds = Array.from(new Set(rows.map((r) => r.createdById).filter(Boolean))) as string[];
  const users = userIds.length ? await db.select().from(schema.users) : [];
  const nameMap: Record<string, string> = {};
  for (const u of users) if (userIds.includes(u.id)) nameMap[u.id] = u.fullName;
  return rows.map((r) => ({ ...r, createdByName: r.createdById ? nameMap[r.createdById] || "-" : "-" }));
}

export async function getCashTransaction(id: string) {
  await requirePermission("cash.view");
  const [tx] = await db.select().from(schema.cashTransactions).where(eq(schema.cashTransactions.id, id));
  if (!tx) return null;
  let createdByName: string | undefined;
  let drawerName: string | undefined;
  if (tx.createdById) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, tx.createdById));
    createdByName = u?.fullName;
  }
  const [d] = await db.select().from(schema.cashDrawers).where(eq(schema.cashDrawers.id, tx.drawerId));
  drawerName = d?.name;
  return { ...tx, createdByName, drawerName };
}

export async function listPaymentMethods() {
  const session = await requireSession();
  return db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.active, true));
}
