"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { adjustStock, updateConsignmentBalance, postCashByPaymentMethod, stockShortageMessage } from "@/lib/ops";
import { revalidatePath } from "next/cache";

export async function listEmployees() {
  await requirePermission("consignments.manage");
  return db.select().from(schema.users).where(eq(schema.users.active, true));
}

export async function listConsignments() {
  await requirePermission("consignments.manage");
  const rows = await db
    .select({
      id: schema.consignments.id,
      balance: schema.consignments.balance,
      active: schema.consignments.active,
      holderName: schema.users.fullName,
      holderId: schema.users.id,
    })
    .from(schema.consignments)
    .innerJoin(schema.users, eq(schema.consignments.holderId, schema.users.id));
  return rows;
}

export async function giveConsignment(input: {
  holderId: string;
  locationId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
}) {
  await requirePermission("consignments.manage");
  const totalValue = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const result = await db.transaction(async (tx) => {
    let [consignment] = await tx.select().from(schema.consignments).where(eq(schema.consignments.holderId, input.holderId));
    if (!consignment) {
      [consignment] = await tx.insert(schema.consignments).values({ holderId: input.holderId }).returning();
    }
    for (const item of input.items) {
      await tx.insert(schema.consignmentItems).values({
        consignmentId: consignment.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      });
      const newQty = await adjustStock(tx, item.productId, input.locationId, -item.quantity);
      if (newQty < 0) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
        const available = newQty + item.quantity;
        throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "", input.locationId, available, item.quantity));
      }
    }
    await updateConsignmentBalance(tx, consignment.id, totalValue);
    return consignment;
  });

  await logAudit({ action: "CREATE", entityType: "Consignment", entityId: result.id, after: input });
  revalidatePath("/consignments");
  revalidatePath("/products");
  return result;
}

export async function settleConsignment(consignmentId: string, amount: number, paymentMethodId: string) {
  await requirePermission("consignments.manage");
  const session = await requireSession();
  await db.transaction(async (tx) => {
    await updateConsignmentBalance(tx, consignmentId, -amount);
    await postCashByPaymentMethod(tx, paymentMethodId, "COLLECTION_IN", amount, {
      note: "تسوية عهدة",
      refType: "Consignment",
      refId: consignmentId,
      createdById: session.userId,
    });
  });
  await logAudit({ action: "SETTLE", entityType: "Consignment", entityId: consignmentId, after: { amount } });
  revalidatePath("/consignments");
  revalidatePath("/cash");
}

export async function getConsignmentItems(consignmentId: string) {
  await requirePermission("consignments.manage");
  const rows = await db
    .select({
      id: schema.consignmentItems.id,
      productId: schema.consignmentItems.productId,
      quantity: schema.consignmentItems.quantity,
      unitPrice: schema.consignmentItems.unitPrice,
      returnedQty: schema.consignmentItems.returnedQty,
      productName: schema.products.name,
    })
    .from(schema.consignmentItems)
    .innerJoin(schema.products, eq(schema.consignmentItems.productId, schema.products.id))
    .where(eq(schema.consignmentItems.consignmentId, consignmentId));
  return rows;
}

// تسجيل رجوع بضاعة من عهدة موظف للمخزون - بيرجع الكمية للمخزون وبينقص قيمتها من رصيد العهدة عليه
export async function returnConsignmentItems(input: {
  consignmentId: string;
  locationId: string;
  items: { itemId: string; quantity: number }[];
}) {
  await requirePermission("consignments.manage");
  const session = await requireSession();

  const validItems = input.items.filter((i) => i.quantity > 0);
  if (validItems.length === 0) throw new Error("لازم تحدد كمية أكبر من صفر لصنف واحد على الأقل عشان ترجعه");

  let totalReturnedValue = 0;
  await db.transaction(async (tx) => {
    for (const ret of validItems) {
      const [row] = await tx.select().from(schema.consignmentItems).where(eq(schema.consignmentItems.id, ret.itemId)).for("update");
      if (!row || row.consignmentId !== input.consignmentId) throw new Error("صنف غير صحيح في العهدة دي");
      const remaining = row.quantity - row.returnedQty;
      if (ret.quantity > remaining) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, row.productId));
        throw new Error(`المتبقي فعليًا مع الموظف من "${product?.name || "المنتج"}" هو ${remaining} بس - مينفعش ترجع ${ret.quantity}`);
      }
      await tx.update(schema.consignmentItems).set({ returnedQty: row.returnedQty + ret.quantity }).where(eq(schema.consignmentItems.id, row.id));
      await adjustStock(tx, row.productId, input.locationId, ret.quantity);
      totalReturnedValue += ret.quantity * Number(row.unitPrice);
    }
    await updateConsignmentBalance(tx, input.consignmentId, -totalReturnedValue);
  });

  await logAudit({ action: "RETURN", entityType: "Consignment", entityId: input.consignmentId, after: { items: validItems, totalReturnedValue } });
  revalidatePath("/consignments");
  revalidatePath("/products");
  return { totalReturnedValue };
}
