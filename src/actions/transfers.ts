"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock } from "@/lib/ops";
import { revalidatePath } from "next/cache";

export async function createTransfer(input: {
  fromLocationId: string;
  toLocationId: string;
  items: { productId: string; quantity: number }[];
  note?: string;
}) {
  await requirePermission("transfers.create");
  const session = await requireSession();
  if (input.fromLocationId === input.toLocationId) throw new Error("لازم يكون المصدر والوجهة مختلفين");

  const result = await db.transaction(async (tx) => {
    const code = genCode("TRF");
    const [transfer] = await tx
      .insert(schema.stockTransfers)
      .values({ code, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, createdById: session.userId, note: input.note })
      .returning();

    for (const item of input.items) {
      const [existing] = await tx
        .select()
        .from(schema.stocks)
        .where(eq(schema.stocks.productId, item.productId));
      await tx.insert(schema.stockTransferItems).values({ transferId: transfer.id, productId: item.productId, quantity: item.quantity });
      const newFrom = await adjustStock(tx, item.productId, input.fromLocationId, -item.quantity);
      if (newFrom < 0) throw new Error("الكمية المطلوب تحويلها أكبر من الرصيد المتاح");
      await adjustStock(tx, item.productId, input.toLocationId, item.quantity);
      // نقل السيريالات الموجودة في المكان القديم لو المنتج بسيريال
      const serials = await tx
        .select()
        .from(schema.productSerials)
        .where(eq(schema.productSerials.productId, item.productId));
      let moved = 0;
      for (const s of serials) {
        if (moved >= item.quantity) break;
        if (s.locationId === input.fromLocationId && s.status === "IN_STOCK") {
          await tx.update(schema.productSerials).set({ locationId: input.toLocationId }).where(eq(schema.productSerials.id, s.id));
          moved++;
        }
      }
    }
    return transfer;
  });

  await logAudit({ action: "CREATE", entityType: "StockTransfer", entityId: result.id, after: result });
  revalidatePath("/products");
  revalidatePath("/transfers");
  return result;
}

export async function listTransfers() {
  await requirePermission("transfers.create");
  const rows = await db
    .select({
      id: schema.stockTransfers.id,
      code: schema.stockTransfers.code,
      createdAt: schema.stockTransfers.createdAt,
      note: schema.stockTransfers.note,
      fromName: schema.locations.name,
    })
    .from(schema.stockTransfers)
    .innerJoin(schema.locations, eq(schema.stockTransfers.fromLocationId, schema.locations.id))
    .orderBy(schema.stockTransfers.createdAt);
  return rows.reverse();
}
