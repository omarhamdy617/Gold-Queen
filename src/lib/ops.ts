import "server-only";
import { schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";

// كل الدوال دي بتتنفذ جوه transaction (tx) عشان تضمن التزامن الصحيح مع كذا مستخدم بيكتبوا في نفس اللحظة

type Tx = any; // drizzle transaction type (postgres-js)

export async function postCashByPaymentMethod(
  tx: Tx,
  paymentMethodId: string,
  type: (typeof schema.cashTxTypeEnum.enumValues)[number],
  amount: number,
  opts: { note?: string; refType?: string; refId?: string; createdById?: string; direction?: "in" | "out" } = {}
) {
  if (amount <= 0) return;
  const [drawer] = await tx
    .select()
    .from(schema.cashDrawers)
    .where(eq(schema.cashDrawers.paymentMethodId, paymentMethodId))
    .for("update");
  if (!drawer) throw new Error("لا توجد خزينة مرتبطة بطريقة الدفع دي");

  const isOut = opts.direction
    ? opts.direction === "out"
    : ["PURCHASE_OUT", "EXPENSE_OUT", "PAYMENT_OUT", "RETURN_OUT", "TRANSFER_OUT"].includes(type);
  const signedAmount = isOut ? -amount : amount;
  const newBalance = Number(drawer.balance) + signedAmount;

  await tx.update(schema.cashDrawers).set({ balance: newBalance.toFixed(2), updatedAt: new Date() }).where(eq(schema.cashDrawers.id, drawer.id));

  await tx.insert(schema.cashTransactions).values({
    drawerId: drawer.id,
    type,
    amount: amount.toFixed(2),
    balanceAfter: newBalance.toFixed(2),
    note: opts.note,
    refType: opts.refType,
    refId: opts.refId,
    createdById: opts.createdById,
  });
  return newBalance;
}

export async function adjustStock(tx: Tx, productId: string, locationId: string, delta: number) {
  const [existing] = await tx
    .select()
    .from(schema.stocks)
    .where(and(eq(schema.stocks.productId, productId), eq(schema.stocks.locationId, locationId)))
    .for("update");
  if (existing) {
    const newQty = existing.quantity + delta;
    await tx.update(schema.stocks).set({ quantity: newQty, updatedAt: new Date() }).where(eq(schema.stocks.id, existing.id));
    return newQty;
  } else {
    await tx.insert(schema.stocks).values({ productId, locationId, quantity: delta });
    return delta;
  }
}

export async function updateCustomerBalance(tx: Tx, customerId: string, delta: number) {
  const [c] = await tx.select().from(schema.customers).where(eq(schema.customers.id, customerId)).for("update");
  if (!c) throw new Error("عميل غير موجود");
  const newBalance = Number(c.balance) + delta;
  await tx.update(schema.customers).set({ balance: newBalance.toFixed(2) }).where(eq(schema.customers.id, customerId));
  return newBalance;
}

export async function updateSupplierBalance(tx: Tx, supplierId: string, delta: number) {
  const [s] = await tx.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplierId)).for("update");
  if (!s) throw new Error("مورد غير موجود");
  const newBalance = Number(s.balance) + delta;
  await tx.update(schema.suppliers).set({ balance: newBalance.toFixed(2) }).where(eq(schema.suppliers.id, supplierId));
  return newBalance;
}

export async function updateConsignmentBalance(tx: Tx, consignmentId: string, delta: number) {
  const [c] = await tx.select().from(schema.consignments).where(eq(schema.consignments.id, consignmentId)).for("update");
  if (!c) throw new Error("عهدة غير موجودة");
  const newBalance = Number(c.balance) + delta;
  await tx.update(schema.consignments).set({ balance: newBalance.toFixed(2) }).where(eq(schema.consignments.id, consignmentId));
  return newBalance;
}

// متوسط التكلفة المرجح: التكلفة الجديدة = (كمية قديمة * تكلفة قديمة + كمية جديدة * تكلفة جديدة) / إجمالي الكمية
export async function updateWeightedAvgCost(tx: Tx, productId: string, addedQty: number, addedUnitCost: number) {
  const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, productId)).for("update");
  if (!product) throw new Error("منتج غير موجود");

  const stockRows = await tx.select().from(schema.stocks).where(eq(schema.stocks.productId, productId));
  const currentQty = stockRows.reduce((s: number, r: any) => s + r.quantity, 0);
  const currentCost = Number(product.avgCost);

  const totalQty = currentQty + addedQty;
  const newAvgCost =
    totalQty > 0 ? (currentQty * currentCost + addedQty * addedUnitCost) / totalQty : addedUnitCost;

  await tx.update(schema.products).set({ avgCost: newAvgCost.toFixed(2), updatedAt: new Date() }).where(eq(schema.products.id, productId));
  return newAvgCost;
}

export function checkCreditLimit(customer: { creditLimit: string | number; balance: string | number }, additionalDebt: number) {
  const limit = Number(customer.creditLimit);
  if (limit <= 0) return { ok: true }; // 0 = بدون حد
  const projected = Number(customer.balance) + additionalDebt;
  if (projected > limit) {
    return { ok: false, message: `تجاوز حد الائتمان! الحد الأقصى ${limit} والمديونية بعد العملية هتبقى ${projected.toFixed(2)}` };
  }
  return { ok: true };
}
