"use server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode, can } from "@/lib/auth";
import { adjustStock } from "@/lib/ops";
import { revalidatePath } from "next/cache";

// -------------------- خريطة الكميات المتاحة في مكان معيّن (للاستخدام في اختيار المنتج) --------------------
export async function getStockMap(locationId: string) {
  await requirePermission("transfers.create");
  if (!locationId) return {};
  const rows = await db.select().from(schema.stocks).where(eq(schema.stocks.locationId, locationId));
  const map: Record<string, number> = {};
  for (const r of rows) map[r.productId] = r.quantity;
  return map;
}

async function assertEnoughStock(fromLocationId: string, items: { productId: string; quantity: number }[]) {
  for (const item of items) {
    const [row] = await db
      .select()
      .from(schema.stocks)
      .where(and(eq(schema.stocks.productId, item.productId), eq(schema.stocks.locationId, fromLocationId)));
    const available = row?.quantity || 0;
    if (available < item.quantity) {
      const [product] = await db.select().from(schema.products).where(eq(schema.products.id, item.productId));
      throw new Error(`الكمية المتاحة من "${product?.name || "المنتج"}" في المكان المصدر هي ${available} فقط، وانت طالب تحويل ${item.quantity}`);
    }
  }
}

export async function createTransfer(input: {
  fromLocationId: string;
  toLocationId: string;
  items: { productId: string; quantity: number }[];
  note?: string;
}) {
  await requirePermission("transfers.create");
  const session = await requireSession();
  if (!input.fromLocationId || !input.toLocationId) throw new Error("لازم تحدد المكان المصدر والمكان الوجهة");
  if (input.fromLocationId === input.toLocationId) throw new Error("لازم يكون المصدر والوجهة مختلفين");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");
  for (const it of input.items) {
    if (!it.productId) throw new Error("فيه سطر منتج لسه ماتحددش");
    if (!it.quantity || it.quantity <= 0) throw new Error("لازم تدخل كمية صحيحة لكل صنف");
  }
  await assertEnoughStock(input.fromLocationId, input.items);

  const result = await db.transaction(async (tx) => {
    const code = genCode("TRF");
    const [transfer] = await tx
      .insert(schema.stockTransfers)
      .values({ code, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, createdById: session.userId, note: input.note })
      .returning();

    for (const item of input.items) {
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

// -------------------- تعديل تحويل سابق (بيعكس الأثر القديم ويطبق الجديد) --------------------
export async function updateTransfer(
  id: string,
  input: { fromLocationId: string; toLocationId: string; items: { productId: string; quantity: number }[]; note?: string }
) {
  await requirePermission("transfers.edit");
  if (!input.fromLocationId || !input.toLocationId) throw new Error("لازم تحدد المكان المصدر والمكان الوجهة");
  if (input.fromLocationId === input.toLocationId) throw new Error("لازم يكون المصدر والوجهة مختلفين");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");
  for (const it of input.items) {
    if (!it.productId) throw new Error("فيه سطر منتج لسه ماتحددش");
    if (!it.quantity || it.quantity <= 0) throw new Error("لازم تدخل كمية صحيحة لكل صنف");
  }

  const [transfer] = await db.select().from(schema.stockTransfers).where(eq(schema.stockTransfers.id, id));
  if (!transfer) throw new Error("التحويل غير موجود");
  const oldItems = await db.select().from(schema.stockTransferItems).where(eq(schema.stockTransferItems.transferId, id));

  await db.transaction(async (tx) => {
    // عكس أثر التحويل القديم
    for (const item of oldItems) {
      await adjustStock(tx, item.productId, transfer.toLocationId, -item.quantity);
      await adjustStock(tx, item.productId, transfer.fromLocationId, item.quantity);
    }
    // تحقق من توفر الكمية الجديدة بعد العكس
    for (const item of input.items) {
      const [row] = await tx
        .select()
        .from(schema.stocks)
        .where(and(eq(schema.stocks.productId, item.productId), eq(schema.stocks.locationId, input.fromLocationId)));
      const available = row?.quantity || 0;
      if (available < item.quantity) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
        throw new Error(`بعد التعديل، الكمية المتاحة من "${product?.name || "المنتج"}" هي ${available} فقط، وانت طالب ${item.quantity}`);
      }
    }
    await tx.delete(schema.stockTransferItems).where(eq(schema.stockTransferItems.transferId, id));
    for (const item of input.items) {
      await tx.insert(schema.stockTransferItems).values({ transferId: id, productId: item.productId, quantity: item.quantity });
      await adjustStock(tx, item.productId, input.fromLocationId, -item.quantity);
      await adjustStock(tx, item.productId, input.toLocationId, item.quantity);
    }
    await tx
      .update(schema.stockTransfers)
      .set({ fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, note: input.note })
      .where(eq(schema.stockTransfers.id, id));
  });

  await logAudit({ action: "UPDATE", entityType: "StockTransfer", entityId: id, before: { oldItems }, after: input });
  revalidatePath("/products");
  revalidatePath("/transfers");
}

export async function getTransfer(id: string) {
  await requirePermission("transfers.create");
  const [transfer] = await db
    .select({
      id: schema.stockTransfers.id,
      code: schema.stockTransfers.code,
      note: schema.stockTransfers.note,
      createdAt: schema.stockTransfers.createdAt,
      fromLocationId: schema.stockTransfers.fromLocationId,
      toLocationId: schema.stockTransfers.toLocationId,
      createdById: schema.stockTransfers.createdById,
      createdByName: schema.users.fullName,
    })
    .from(schema.stockTransfers)
    .leftJoin(schema.users, eq(schema.stockTransfers.createdById, schema.users.id))
    .where(eq(schema.stockTransfers.id, id));
  if (!transfer) return null;
  const items = await db
    .select({ id: schema.stockTransferItems.id, productId: schema.stockTransferItems.productId, quantity: schema.stockTransferItems.quantity, productName: schema.products.name })
    .from(schema.stockTransferItems)
    .innerJoin(schema.products, eq(schema.stockTransferItems.productId, schema.products.id))
    .where(eq(schema.stockTransferItems.transferId, id));
  const canEdit = await can("transfers.edit");
  return { transfer, items, canEdit };
}

export async function listTransfers() {
  await requirePermission("transfers.create");
  const from = schema.locations;
  const rows = await db
    .select({
      id: schema.stockTransfers.id,
      code: schema.stockTransfers.code,
      createdAt: schema.stockTransfers.createdAt,
      note: schema.stockTransfers.note,
      fromName: from.name,
      toLocationId: schema.stockTransfers.toLocationId,
    })
    .from(schema.stockTransfers)
    .innerJoin(from, eq(schema.stockTransfers.fromLocationId, from.id))
    .orderBy(schema.stockTransfers.createdAt);
  const locs = await db.select().from(schema.locations);
  const locMap: Record<string, string> = {};
  for (const l of locs) locMap[l.id] = l.name;
  return rows.reverse().map((r) => ({ ...r, toName: locMap[r.toLocationId] || "" }));
}
