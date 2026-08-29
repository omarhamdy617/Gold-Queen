"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { adjustStock, updateConsignmentBalance, postCashByPaymentMethod } from "@/lib/ops";
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
      if (newQty < 0) throw new Error("الكمية غير متوفرة");
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
